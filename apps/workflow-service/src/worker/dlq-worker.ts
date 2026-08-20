import type { Job } from "bullmq";
import { Queue } from "bullmq";
import type { DlqJob, WorkflowRetryJob } from "@relayos/queue";
import { QUEUES, bullmqRedis, DLQ_DEFAULT_JOB_OPTIONS } from "@relayos/queue";
import { createLogger } from "@relayos/lib/logger";
import {
  getExecution,
  getWorkflowDefinition,
  getLatestStepRows,
  updateExecutionCurrentStepId,
  getExecutionIsSaga,
  saveCompensationInput,
  getCompensatableSteps,
} from "../services/execution-service.js";
import {
  transitionExecution,
  transitionStep,
  updateSagaStatus,
} from "../engine/state-machine.js";
import {
  getContext,
  updateContext,
  deleteContext,
} from "../engine/context-manager.js";
import { runSteps } from "../engine/step-runner.js";
import { runSaga } from "../engine/saga/saga-coordinator.js";
import { runCompensation } from "../engine/saga/compensation-runner.js";
import { transitionCompensationStatus } from "../engine/state-machine.js";

const retryQueue = new Queue<WorkflowRetryJob>(QUEUES.WORKFLOW_RETRY, {
  connection: bullmqRedis,
});

const dlqQueue = new Queue<DlqJob>(QUEUES.WORKFLOW_DLQ, {
  connection: bullmqRedis,
  defaultJobOptions: DLQ_DEFAULT_JOB_OPTIONS,
});

async function enqueueRetry(
  job: WorkflowRetryJob,
  delayMs: number,
): Promise<void> {
  await retryQueue.add("retry", job, { delay: delayMs });
}

async function enqueueDlq(job: DlqJob): Promise<void> {
  await dlqQueue.add("dead-letter", job);
}

export async function processDlq(job: Job<DlqJob>): Promise<void> {
  const data = job.data;
  const log = createLogger({
    executionId: data.executionId,
    workflowId: data.workflowId,
    stepId: data.stepId,
    jobId: job.id,
    component: "dlq-worker",
  });

  const execution = await getExecution(data.executionId);

  if (!execution) {
    log.error("Execution not found — stale DLQ job, skipping");
    return;
  }

  if (execution.status !== "RUNNING") {
    log.warn(
      { currentStatus: execution.status },
      "Execution no longer RUNNING — skipping DLQ processing",
    );
    return;
  }

  log.warn(
    {
      stepType: data.stepType,
      attempt: data.attempt,
      onError: data.onError,
      failureError: data.failureError,
    },
    "Processing dead-lettered step",
  );

  if (data.onError === "FAIL") {
    if (data.isSaga) {
      await transitionExecution(data.executionId, "RUNNING", "FAILED", {
        error: data.failureError,
        completedAt: new Date(),
      });

      const definition = await getWorkflowDefinition(data.workflowId);
      if (!definition) {
        log.error("Workflow definition not found during saga compensation — skipping compensation");
        await deleteContext(data.executionId).catch((err) => {
          log.warn({ err }, "Failed to clean up execution context from Redis");
        });
        return;
      }

      const sagaResult = await runSaga(data.executionId, {
        getCompensatableSteps: (executionId) => getCompensatableSteps(executionId, definition),
        updateSagaStatus,
        runCompensation: (step, deps) => runCompensation(step, deps),
      });

      await updateSagaStatus(
        data.executionId,
        sagaResult === "compensated" ? "COMPENSATED" : "COMPENSATION_FAILED",
      );

      log.info({ sagaResult }, "Saga compensation complete, execution is FAILED");

      await deleteContext(data.executionId).catch((err) => {
        log.warn({ err }, "Failed to clean up execution context from Redis");
      });

      return;
    }

    await transitionExecution(data.executionId, "RUNNING", "FAILED", {
      error: data.failureError,
      completedAt: new Date(),
    });

    await deleteContext(data.executionId).catch((err) => {
      log.warn({ err }, "Failed to clean up execution context from Redis");
    });

    log.info("Execution transitioned to FAILED");
    return;
  }

  await transitionStep(data.executionStepRowId, "FAILED", "SKIPPED");
  log.info("Step transitioned to SKIPPED");

  const definition = await getWorkflowDefinition(data.workflowId);
  if (!definition) {
    log.error("Workflow definition not found during DLQ SKIP processing");
    await transitionExecution(data.executionId, "RUNNING", "FAILED", {
      error: `Workflow ${data.workflowId} not found during DLQ processing`,
      completedAt: new Date(),
    });
    return;
  }

  const stepDef = definition.steps.find((s) => s.id === data.stepId);
  const nextStepId = stepDef?.onSuccess;

  if (!nextStepId) {
    log.info("No step after skipped step — execution completed");
    await transitionExecution(data.executionId, "RUNNING", "COMPLETED", {
      completedAt: new Date(),
    });
    await deleteContext(data.executionId).catch((err) => {
      log.warn({ err }, "Failed to clean up execution context from Redis");
    });
    return;
  }

  const stepRows = await getLatestStepRows(data.executionId);

  log.info({ nextStepId }, "Resuming execution after SKIP");
  const result = await runSteps(
    data.executionId,
    data.workflowId,
    data.projectId,
    definition,
    stepRows,
    { transitionStep, getContext, updateContext, enqueueRetry, enqueueDlq, saveCompensationInput, getExecutionIsSaga },
    { startFromStepId: nextStepId },
  );

  if (result.pausedAtStepId) {
    log.info(
      { pausedAtStepId: result.pausedAtStepId },
      "Execution paused at approval step after DLQ SKIP",
    );
    await updateExecutionCurrentStepId(
      data.executionId,
      result.pausedAtStepId,
    );
    await transitionExecution(data.executionId, "RUNNING", "WAITING_APPROVAL");
    return;
  }

  if (result.retryEnqueued) {
    log.info(
      "Next step enqueued for retry after DLQ SKIP — execution remains RUNNING",
    );
    return;
  }

  if (result.dlqEnqueued) {
    log.info(
      "Next step sent to DLQ after SKIP resume — execution remains RUNNING",
    );
    return;
  }

  if (result.success) {
    log.info(
      { completedSteps: result.completedSteps },
      "Execution completed after DLQ SKIP resume",
    );
    await transitionExecution(data.executionId, "RUNNING", "COMPLETED", {
      completedAt: new Date(),
    });
  } else {
    log.error(
      { failedStepId: result.failedStepId, error: result.error },
      "Execution failed after DLQ SKIP resume",
    );
    await transitionExecution(data.executionId, "RUNNING", "FAILED", {
      error: result.error,
      completedAt: new Date(),
    });
  }

  await deleteContext(data.executionId).catch((err) => {
    log.warn({ err }, "Failed to clean up execution context from Redis");
  });
}
