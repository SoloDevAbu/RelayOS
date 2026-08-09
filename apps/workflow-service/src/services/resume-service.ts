import { Queue } from "bullmq";
import type { WorkflowExecuteJob } from "@relayos/queue";
import { QUEUES, bullmqRedis } from "@relayos/queue";
import { db } from "@relayos/db/client";
import { approvals, executions, executionSteps } from "@relayos/db/schema";
import { eq, and } from "drizzle-orm";
import { transitionExecution, transitionStep } from "../engine/state-machine.js";

const executeQueue = new Queue<WorkflowExecuteJob>(QUEUES.WORKFLOW_EXECUTE, {
  connection: bullmqRedis,
});

export class ApprovalAlreadyDecidedError extends Error {
  constructor(approvalId: string, currentStatus: string) {
    super(`Approval ${approvalId} is already ${currentStatus} — cannot decide again`);
    this.name = "ApprovalAlreadyDecidedError";
  }
}

export class ExecutionNotWaitingError extends Error {
  constructor(executionId: string, currentStatus: string) {
    super(`Execution ${executionId} is ${currentStatus}, not WAITING_APPROVAL — cannot resume`);
    this.name = "ExecutionNotWaitingError";
  }
}

export class ExecutionNotFoundError extends Error {
  constructor(executionId: string) {
    super(`Execution ${executionId} not found`);
    this.name = "ExecutionNotFoundError";
  }
}

export async function resumeExecution(
  executionId: string,
  decision: "APPROVED" | "REJECTED",
): Promise<void> {
  const [execution] = await db
    .select({
      id: executions.id,
      workflowId: executions.workflowId,
      projectId: executions.projectId,
      status: executions.status,
      currentStepId: executions.currentStepId,
    })
    .from(executions)
    .where(eq(executions.id, executionId))
    .limit(1);

  if (!execution) {
    throw new ExecutionNotFoundError(executionId);
  }

  if (execution.status !== "WAITING_APPROVAL") {
    throw new ExecutionNotWaitingError(executionId, execution.status);
  }

  if (decision === "REJECTED") {
    if (execution.currentStepId) {
      const [pausedStep] = await db
        .select({ id: executionSteps.id })
        .from(executionSteps)
        .where(
          and(
            eq(executionSteps.executionId, executionId),
            eq(executionSteps.stepId, execution.currentStepId),
            eq(executionSteps.status, "WAITING_APPROVAL"),
          ),
        )
        .limit(1);

      if (pausedStep) {
        await transitionStep(pausedStep.id, "WAITING_APPROVAL", "CANCELLED");
      }
    }

    await transitionExecution(executionId, "WAITING_APPROVAL", "CANCELLED");
    return;
  }

  await transitionExecution(executionId, "WAITING_APPROVAL", "RUNNING");

  await executeQueue.add(
    "resume",
    {
      executionId: execution.id,
      workflowId: execution.workflowId,
      projectId: execution.projectId,
      resumeFromStepId: execution.currentStepId ?? undefined,
      approvalDecision: "APPROVED",
    },
    { jobId: `resume-${executionId}-${Date.now()}` },
  );
}
