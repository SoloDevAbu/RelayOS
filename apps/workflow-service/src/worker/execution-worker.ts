import type { Job } from "bullmq";
import { Queue } from "bullmq";
import type { WorkflowExecuteJob, WorkflowRetryJob, DlqJob } from "@relayos/queue";
import { QUEUES, bullmqRedis, DLQ_DEFAULT_JOB_OPTIONS } from "@relayos/queue";
import { createLogger } from "@relayos/lib/logger";
import {
  getExecution,
  getWorkflowDefinition,
  insertExecutionSteps,
  getLatestStepRows,
  updateExecutionCurrentStepId,
} from "../services/execution-service.js";
import {
  transitionExecution,
  transitionStep,
  InvalidTransitionError,
} from "../engine/state-machine.js";
import { getContext, updateContext, deleteContext, updateIterationHistory, getIterationHistory } from "../engine/context-manager.js";
import { runSteps } from "../engine/step-runner.js";
import { approvals } from "@relayos/db/schema";
import { db } from "@relayos/db/client";
import { eq, and } from "drizzle-orm";

const retryQueue = new Queue<WorkflowRetryJob>(QUEUES.WORKFLOW_RETRY, {
  connection: bullmqRedis,
});

async function enqueueRetry(job: WorkflowRetryJob, delayMs: number): Promise<void> {
  await retryQueue.add("retry", job, { delay: delayMs });
}

const dlqQueue = new Queue<DlqJob>(QUEUES.WORKFLOW_DLQ, {
  connection: bullmqRedis,
  defaultJobOptions: DLQ_DEFAULT_JOB_OPTIONS,
});

async function enqueueDlq(job: DlqJob): Promise<void> {
  await dlqQueue.add("dead-letter", job);
}

async function findApprovalStepRowId(executionId: string, stepId: string): Promise<string | null> {
  const [row] = await db
    .select({ id: approvals.id })
    .from(approvals)
    .where(and(eq(approvals.executionId, executionId), eq(approvals.stepId, stepId)))
    .limit(1);
  return row?.id ?? null;
}

export async function processExecution(
  job: Job<WorkflowExecuteJob>,
): Promise<void> {
  const { executionId, workflowId, projectId, resumeFromStepId, approvalDecision } = job.data;
  const isResume = resumeFromStepId !== undefined;

  const log = createLogger({
    executionId,
    workflowId,
    jobId: job.id,
    ...(isResume ? { resumeFromStepId } : {}),
  });

  const execution = await getExecution(executionId);

  if (!execution) {
    log.error("Execution not found — stale job, skipping");
    return;
  }

  if (isResume) {
    if (execution.status !== "RUNNING") {
      log.warn(
        { currentStatus: execution.status },
        "Resumed execution is not RUNNING — skipping",
      );
      return;
    }
  } else {
    if (execution.status !== "PENDING") {
      log.warn(
        { currentStatus: execution.status },
        "Execution is not PENDING — already picked up or duplicate delivery, skipping",
      );
      return;
    }
  }

  const definition = await getWorkflowDefinition(workflowId);

  if (!definition) {
    log.error("Workflow definition not found");
    if (!isResume) {
      await transitionExecution(executionId, "PENDING", "RUNNING", { startedAt: new Date() });
    }
    await transitionExecution(executionId, "RUNNING", "FAILED", {
      error: `Workflow ${workflowId} not found`,
      completedAt: new Date(),
    });
    return;
  }

  if (!isResume) {
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
  }

  try {
    let stepRows;

    if (isResume) {
      log.info({ resumeFromStepId, approvalDecision }, "Resuming execution from approval step");

      stepRows = await getLatestStepRows(executionId);

      const pausedStepDef = resumeFromStepId
        ? definition.steps.find((s) => s.id === resumeFromStepId)
        : undefined;
      const isAiPlanResume = pausedStepDef?.type === "AI_PLAN";

      if (approvalDecision === "APPROVED") {
        const pausedRow = stepRows.find((r) => r.stepId === resumeFromStepId);
        if (pausedRow && pausedRow.status === "WAITING_APPROVAL") {
          if (isAiPlanResume) {
            const existingHistory = await getIterationHistory(executionId, resumeFromStepId!);
            await updateIterationHistory(executionId, resumeFromStepId!, [
              ...existingHistory,
              { action: "request_approval", decision: "APPROVED" },
            ]);
            await transitionStep(pausedRow.id, "WAITING_APPROVAL", "RUNNING");
          } else {
            await transitionStep(pausedRow.id, "WAITING_APPROVAL", "COMPLETED", {
              output: { decision: "APPROVED" },
              completedAt: new Date(),
            });
          }
        }
      }

      const startStepId = isAiPlanResume
        ? resumeFromStepId!
        : definition.steps.find((s) => s.id === resumeFromStepId)?.onSuccess;

      if (!startStepId) {
        log.info("No step after approval — execution completed");
        await transitionExecution(executionId, "RUNNING", "COMPLETED", {
          completedAt: new Date(),
        });
        await deleteContext(executionId).catch((err) => {
          log.warn({ err }, "Failed to clean up execution context from Redis");
        });
        return;
      }

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
          enqueueDlq,
        },
        { startFromStepId: startStepId },
      );

      if (result.pausedAtStepId) {
        log.info({ pausedAtStepId: result.pausedAtStepId }, "Execution paused at approval step");
        await updateExecutionCurrentStepId(executionId, result.pausedAtStepId);
        await transitionExecution(executionId, "RUNNING", "WAITING_APPROVAL");
        return;
      }

      if (result.retryEnqueued) {
        log.info({ completedSteps: result.completedSteps }, "Step enqueued for retry");
        return;
      }

      if (result.dlqEnqueued) {
        log.info({ completedSteps: result.completedSteps }, "Step sent to DLQ — execution remains RUNNING");
        return;
      }

      if (result.success) {
        log.info({ completedSteps: result.completedSteps }, "Execution completed after resume");
        await transitionExecution(executionId, "RUNNING", "COMPLETED", {
          completedAt: new Date(),
        });
      } else {
        log.error({ failedStepId: result.failedStepId, error: result.error }, "Execution failed after resume");
        await transitionExecution(executionId, "RUNNING", "FAILED", {
          error: result.error,
          completedAt: new Date(),
        });
      }
    } else {
      log.info("Inserting execution step rows");
      stepRows = await insertExecutionSteps(executionId, definition);

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
          enqueueDlq,
        },
      );

      if (result.pausedAtStepId) {
        log.info({ pausedAtStepId: result.pausedAtStepId }, "Execution paused at approval step");
        await updateExecutionCurrentStepId(executionId, result.pausedAtStepId);
        await transitionExecution(executionId, "RUNNING", "WAITING_APPROVAL");
        return;
      }

      if (result.retryEnqueued) {
        log.info({ completedSteps: result.completedSteps }, "Step enqueued for retry — execution remains RUNNING");
        return;
      }

      if (result.dlqEnqueued) {
        log.info({ completedSteps: result.completedSteps }, "Step sent to DLQ — execution remains RUNNING");
        return;
      }

      if (result.success) {
        log.info({ completedSteps: result.completedSteps }, "Execution completed successfully");
        await transitionExecution(executionId, "RUNNING", "COMPLETED", {
          completedAt: new Date(),
        });
      } else {
        log.error({ failedStepId: result.failedStepId, error: result.error }, "Execution failed");
        await transitionExecution(executionId, "RUNNING", "FAILED", {
          error: result.error,
          completedAt: new Date(),
        });
      }
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
    const freshExecution = await getExecution(executionId);
    if (freshExecution?.status !== "WAITING_APPROVAL") {
      await deleteContext(executionId).catch((err) => {
        log.warn({ err }, "Failed to clean up execution context from Redis");
      });
    }
  }
}
