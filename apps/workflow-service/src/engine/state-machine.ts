import { db } from "@relayos/db/client";
import { executions, executionSteps } from "@relayos/db/schema";
import { eq, and } from "drizzle-orm";

type ExecutionStatus =
  | "PENDING"
  | "RUNNING"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED"
  | "WAITING_APPROVAL";

type StepStatus =
  | "PENDING"
  | "RUNNING"
  | "COMPLETED"
  | "FAILED"
  | "WAITING_APPROVAL"
  | "CANCELLED"
  | "SKIPPED"
  | "EXHAUSTED";

const EXECUTION_TRANSITIONS: Record<string, ExecutionStatus[]> = {
  PENDING: ["RUNNING"],
  RUNNING: ["COMPLETED", "FAILED", "WAITING_APPROVAL"],
  WAITING_APPROVAL: ["RUNNING", "CANCELLED"],
};

const STEP_TRANSITIONS: Record<string, StepStatus[]> = {
  PENDING: ["RUNNING", "SKIPPED"],
  RUNNING: ["COMPLETED", "FAILED", "WAITING_APPROVAL"],
  FAILED: ["RUNNING", "SKIPPED"],
  WAITING_APPROVAL: ["COMPLETED", "CANCELLED"],
};


export class InvalidTransitionError extends Error {
  constructor(
    public readonly entityType: "execution" | "step",
    public readonly entityId: string,
    public readonly from: string,
    public readonly to: string,
  ) {
    super(
      `Invalid ${entityType} transition: ${from} → ${to} for ${entityType} ${entityId}`,
    );
    this.name = "InvalidTransitionError";
  }
}

function validateTransition(
  map: Record<string, string[]>,
  from: string,
  to: string,
  entityType: "execution" | "step",
  entityId: string,
): void {
  const allowed = map[from];
  if (!allowed || !allowed.includes(to)) {
    throw new InvalidTransitionError(entityType, entityId, from, to);
  }
}

export async function transitionExecution(
  executionId: string,
  from: ExecutionStatus,
  to: ExecutionStatus,
  extra?: { error?: string; startedAt?: Date; completedAt?: Date },
): Promise<void> {
  validateTransition(
    EXECUTION_TRANSITIONS,
    from,
    to,
    "execution",
    executionId,
  );

  const updates: Record<string, unknown> = {
    status: to,
    updatedAt: new Date(),
  };

  if (extra?.startedAt) updates.startedAt = extra.startedAt;
  if (extra?.completedAt) updates.completedAt = extra.completedAt;
  if (extra?.error !== undefined) updates.error = extra.error;

  const result = await db
    .update(executions)
    .set(updates)
    .where(and(eq(executions.id, executionId), eq(executions.status, from)))
    .returning({ id: executions.id });

  if (result.length === 0) {
    throw new InvalidTransitionError(
      "execution",
      executionId,
      from,
      to,
    );
  }
}

export async function transitionStep(
  stepId: string,
  from: StepStatus,
  to: StepStatus,
  extra?: { output?: unknown; error?: string; startedAt?: Date; completedAt?: Date },
): Promise<void> {
  validateTransition(STEP_TRANSITIONS, from, to, "step", stepId);

  const updates: Record<string, unknown> = {
    status: to,
  };

  if (extra?.startedAt) updates.startedAt = extra.startedAt;
  if (extra?.completedAt) updates.completedAt = extra.completedAt;
  if (extra?.output !== undefined) updates.output = extra.output;
  if (extra?.error !== undefined) updates.error = extra.error;

  const result = await db
    .update(executionSteps)
    .set(updates)
    .where(and(eq(executionSteps.id, stepId), eq(executionSteps.status, from)))
    .returning({ id: executionSteps.id });

  if (result.length === 0) {
    throw new InvalidTransitionError("step", stepId, from, to);
  }
}
