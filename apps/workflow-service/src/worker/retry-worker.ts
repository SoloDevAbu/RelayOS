import type { Job } from "bullmq";
import { Queue } from "bullmq";
import type { WorkflowRetryJob } from "@relayos/queue";
import { QUEUES, bullmqRedis } from "@relayos/queue";
import { createLogger } from "@relayos/lib/logger";
import {
  getExecution,
  getWorkflowDefinition,
  getLatestStepRows,
  insertRetryStepRow,
  updateExecutionCurrentStepId,
} from "../services/execution-service.js";
import {
  transitionExecution,
  transitionStep,
} from "../engine/state-machine.js";
import { getContext, updateContext, deleteContext } from "../engine/context-manager.js";
import { runSteps } from "../engine/step-runner.js";

const retryQueue = new Queue<WorkflowRetryJob>(QUEUES.WORKFLOW_RETRY, {
  connection: bullmqRedis,
});

async function enqueueRetry(job: WorkflowRetryJob, delayMs: number): Promise<void> {
  await retryQueue.add("retry", job, { delay: delayMs });
}

export async function processRetry(
  job: Job<WorkflowRetryJob>,
): Promise<void> {
  const { executionId, workflowId, projectId, stepId, attempt } = job.data;
  const log = createLogger({
    executionId,
    workflowId,
    jobId: job.id,
    stepId,
    attempt,
  });

  const execution = await getExecution(executionId);

  if (!execution) {
    log.error("Execution not found — stale retry job, skipping");
    return;
  }

  if (execution.status !== "RUNNING") {
    log.warn(
      { currentStatus: execution.status },
      "Execution is no longer RUNNING — skipping retry",
    );
    return;
  }

  const definition = await getWorkflowDefinition(workflowId);
  if (!definition) {
    log.error("Workflow definition not found during retry");
    await transitionExecution(executionId, "RUNNING", "FAILED", {
      error: `Workflow ${workflowId} not found during retry`,
      completedAt: new Date(),
    });
    return;
  }

  const stepDef = definition.steps.find((s) => s.id === stepId);
  if (!stepDef) {
    log.error({ stepId }, "Step definition not found during retry");
    await transitionExecution(executionId, "RUNNING", "FAILED", {
      error: `Step ${stepId} not found in workflow definition during retry`,
      completedAt: new Date(),
    });
    return;
  }

  log.info({ attempt }, "Inserting retry step row");
  const retryRow = await insertRetryStepRow(executionId, stepId, stepDef.type, attempt);

  const existingRows = await getLatestStepRows(executionId);

  const allRows = existingRows.map((r) =>
    r.stepId === stepId ? retryRow : r,
  );

  log.info({ attempt }, "Resuming execution from failed step");
  const result = await runSteps(
    executionId,
    workflowId,
    projectId,
    definition,
    allRows,
    {
      transitionStep,
      getContext,
      updateContext,
      enqueueRetry,
    },
    { startFromStepId: stepId },
  );

  if (result.pausedAtStepId) {
    log.info({ pausedAtStepId: result.pausedAtStepId }, "Retry run paused at approval step");
    await updateExecutionCurrentStepId(executionId, result.pausedAtStepId);
    await transitionExecution(executionId, "RUNNING", "WAITING_APPROVAL");
    return;
  }

  if (result.retryEnqueued) {
    log.info({ attempt }, "Step enqueued for another retry — execution remains RUNNING");
    return;
  }

  if (result.success) {
    log.info(
      { completedSteps: result.completedSteps },
      "Execution completed after retry",
    );
    await transitionExecution(executionId, "RUNNING", "COMPLETED", {
      completedAt: new Date(),
    });
  } else {
    log.error(
      { failedStepId: result.failedStepId, error: result.error },
      "Execution failed after retry exhausted",
    );
    await transitionExecution(executionId, "RUNNING", "FAILED", {
      error: result.error,
      completedAt: new Date(),
    });
  }

  await deleteContext(executionId).catch((err) => {
    log.warn({ err }, "Failed to clean up execution context from Redis");
  });
}
