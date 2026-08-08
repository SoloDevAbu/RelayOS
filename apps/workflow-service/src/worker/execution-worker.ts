import type { Job } from "bullmq";
import { Queue } from "bullmq";
import type { WorkflowExecuteJob, WorkflowRetryJob } from "@relayos/queue";
import { QUEUES, bullmqRedis } from "@relayos/queue";
import { createLogger } from "@relayos/lib/logger";
import {
  getExecution,
  getWorkflowDefinition,
  insertExecutionSteps,
} from "../services/execution-service.js";
import {
  transitionExecution,
  transitionStep,
  InvalidTransitionError,
} from "../engine/state-machine.js";
import { getContext, updateContext, deleteContext } from "../engine/context-manager.js";
import { runSteps } from "../engine/step-runner.js";

const retryQueue = new Queue<WorkflowRetryJob>(QUEUES.WORKFLOW_RETRY, {
  connection: bullmqRedis,
});

async function enqueueRetry(job: WorkflowRetryJob, delayMs: number): Promise<void> {
  await retryQueue.add("retry", job, { delay: delayMs });
}

export async function processExecution(
  job: Job<WorkflowExecuteJob>,
): Promise<void> {
  const { executionId, workflowId, projectId } = job.data;
  const log = createLogger({
    executionId,
    workflowId,
    jobId: job.id,
  });

  const execution = await getExecution(executionId);

  if (!execution) {
    log.error("Execution not found — stale job, skipping");
    return;
  }

  if (execution.status !== "PENDING") {
    log.warn(
      { currentStatus: execution.status },
      "Execution is not PENDING — already picked up or duplicate delivery, skipping",
    );
    return;
  }

  const definition = await getWorkflowDefinition(workflowId);

  if (!definition) {
    log.error("Workflow definition not found");
    await transitionExecution(executionId, "PENDING", "RUNNING", {
      startedAt: new Date(),
    });
    await transitionExecution(executionId, "RUNNING", "FAILED", {
      error: `Workflow ${workflowId} not found`,
      completedAt: new Date(),
    });
    return;
  }

  try {
    await transitionExecution(executionId, "PENDING", "RUNNING", {
      startedAt: new Date(),
    });
  } catch (error) {
    if (error instanceof InvalidTransitionError) {
      log.warn("Another worker already picked up this execution");
      return;
    }
    throw error;
  }

  let contextCleaned = false;

  try {
    log.info("Inserting execution step rows");
    const stepRows = await insertExecutionSteps(executionId, definition);

    log.info({ stepCount: stepRows.length }, "Running steps");
    const result = await runSteps(
      executionId,
      workflowId,
      projectId,
      definition,
      stepRows,
      {
        transitionStep,
        getContext,
        updateContext,
        enqueueRetry,
      },
    );

    if (result.retryEnqueued) {
      log.info(
        { completedSteps: result.completedSteps },
        "Step enqueued for retry — execution remains RUNNING",
      );
      return;
    }

    if (result.success) {
      log.info(
        { completedSteps: result.completedSteps },
        "Execution completed successfully",
      );
      await transitionExecution(executionId, "RUNNING", "COMPLETED", {
        completedAt: new Date(),
      });
    } else {
      log.error(
        { failedStepId: result.failedStepId, error: result.error },
        "Execution failed",
      );
      await transitionExecution(executionId, "RUNNING", "FAILED", {
        error: result.error,
        completedAt: new Date(),
      });
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log.error({ err: error }, "Unexpected error during execution");

    try {
      await transitionExecution(executionId, "RUNNING", "FAILED", {
        error: errorMessage,
        completedAt: new Date(),
      });
    } catch (transitionError) {
      log.error({ err: transitionError }, "Failed to transition execution to FAILED after crash");
    }
  } finally {
    if (!contextCleaned) {
      await deleteContext(executionId).catch((err) => {
        log.warn({ err }, "Failed to clean up execution context from Redis");
      });
    }
  }
}
