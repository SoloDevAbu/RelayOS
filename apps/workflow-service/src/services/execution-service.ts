import { db } from "@relayos/db/client";
import { executions, executionSteps, workflows } from "@relayos/db/schema";
import { eq, desc, sql } from "drizzle-orm";
import type { WorkflowDefinition } from "@relayos/types";

export interface ExecutionRow {
  id: string;
  workflowId: string;
  projectId: string;
  status: string;
  triggerPayload: unknown;
  correlationId: string | null;
  error: string | null;
}

export interface ExecutionStepRow {
  id: string;
  executionId: string;
  stepId: string;
  stepType: string;
  status: string;
  attempt: number;
}

export async function getExecution(
  executionId: string,
): Promise<ExecutionRow | null> {
  const [row] = await db
    .select({
      id: executions.id,
      workflowId: executions.workflowId,
      projectId: executions.projectId,
      status: executions.status,
      triggerPayload: executions.triggerPayload,
      correlationId: executions.correlationId,
      error: executions.error,
    })
    .from(executions)
    .where(eq(executions.id, executionId))
    .limit(1);

  return row ?? null;
}

export async function getWorkflowDefinition(
  workflowId: string,
): Promise<WorkflowDefinition | null> {
  const [row] = await db
    .select({
      definition: workflows.definition,
    })
    .from(workflows)
    .where(eq(workflows.id, workflowId))
    .limit(1);

  if (!row) return null;

  return row.definition as WorkflowDefinition;
}

export async function insertExecutionSteps(
  executionId: string,
  definition: WorkflowDefinition,
): Promise<ExecutionStepRow[]> {
  const values = definition.steps.map((step) => ({
    executionId,
    stepId: step.id,
    stepType: step.type,
    status: "PENDING" as const,
    attempt: 1,
  }));

  const rows = await db
    .insert(executionSteps)
    .values(values)
    .returning({
      id: executionSteps.id,
      executionId: executionSteps.executionId,
      stepId: executionSteps.stepId,
      stepType: executionSteps.stepType,
      status: executionSteps.status,
      attempt: executionSteps.attempt,
    });

  return rows;
}

export async function insertRetryStepRow(
  executionId: string,
  stepId: string,
  stepType: string,
  attempt: number,
): Promise<ExecutionStepRow> {
  const [row] = await db
    .insert(executionSteps)
    .values({
      executionId,
      stepId,
      stepType: stepType as "AI_PLAN" | "TOOL_CALL" | "APPROVAL" | "CONDITION" | "TRANSFORM" | "DELAY",
      status: "PENDING",
      attempt,
    })
    .returning({
      id: executionSteps.id,
      executionId: executionSteps.executionId,
      stepId: executionSteps.stepId,
      stepType: executionSteps.stepType,
      status: executionSteps.status,
      attempt: executionSteps.attempt,
    });

  if (!row) {
    throw new Error(`Failed to insert retry step row for ${stepId} attempt ${attempt}`);
  }

  return row;
}

export async function getLatestStepRows(
  executionId: string,
): Promise<ExecutionStepRow[]> {
  const latestAttemptSubq = db
    .select({
      stepId: executionSteps.stepId,
      maxAttempt: sql<number>`max(${executionSteps.attempt})`.as("max_attempt"),
    })
    .from(executionSteps)
    .where(eq(executionSteps.executionId, executionId))
    .groupBy(executionSteps.stepId)
    .as("latest");

  return db
    .select({
      id: executionSteps.id,
      executionId: executionSteps.executionId,
      stepId: executionSteps.stepId,
      stepType: executionSteps.stepType,
      status: executionSteps.status,
      attempt: executionSteps.attempt,
    })
    .from(executionSteps)
    .innerJoin(
      latestAttemptSubq,
      sql`${executionSteps.stepId} = ${latestAttemptSubq.stepId} and ${executionSteps.attempt} = ${latestAttemptSubq.maxAttempt}`,
    )
    .where(eq(executionSteps.executionId, executionId));
}

export async function getExecutionSteps(
  executionId: string,
): Promise<ExecutionStepRow[]> {
  return db
    .select({
      id: executionSteps.id,
      executionId: executionSteps.executionId,
      stepId: executionSteps.stepId,
      stepType: executionSteps.stepType,
      status: executionSteps.status,
      attempt: executionSteps.attempt,
    })
    .from(executionSteps)
    .where(eq(executionSteps.executionId, executionId))
    .orderBy(desc(executionSteps.attempt));
}

export async function updateExecutionCurrentStepId(
  executionId: string,
  stepId: string,
): Promise<void> {
  await db
    .update(executions)
    .set({ currentStepId: stepId, updatedAt: new Date() })
    .where(eq(executions.id, executionId));
}

export async function setExecutionIsSaga(
  executionId: string,
  isSaga: boolean,
): Promise<void> {
  await db
    .update(executions)
    .set({ isSaga, updatedAt: new Date() })
    .where(eq(executions.id, executionId));
}

export async function getExecutionIsSaga(
  executionId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ isSaga: executions.isSaga })
    .from(executions)
    .where(eq(executions.id, executionId))
    .limit(1);
  return row?.isSaga ?? false;
}

export async function saveCompensationInput(
  stepRowId: string,
  input: Record<string, unknown>,
): Promise<void> {
  await db
    .update(executionSteps)
    .set({ compensationInput: input, compensationStatus: "PENDING" })
    .where(eq(executionSteps.id, stepRowId));
}

export interface CompensatableStepRow {
  stepRowId: string;
  stepId: string;
  compensationToolId: string;
  compensationInput: Record<string, unknown>;
  stepIndex: number;
}

export async function getCompensatableSteps(
  executionId: string,
  definition: WorkflowDefinition,
): Promise<CompensatableStepRow[]> {
  const rows = await db
    .select({
      id: executionSteps.id,
      stepId: executionSteps.stepId,
      compensationInput: executionSteps.compensationInput,
    })
    .from(executionSteps)
    .where(
      eq(executionSteps.executionId, executionId),
    );

  const completedWithCompensation = rows.filter(
    (r) => r.compensationInput !== null,
  );

  const stepDefMap = new Map<string, { index: number; compensationToolId: string }>();
  for (let i = 0; i < definition.steps.length; i++) {
    const step = definition.steps[i]!;
    if (step.compensationToolId) {
      stepDefMap.set(step.id, { index: i, compensationToolId: step.compensationToolId });
    }
  }

  return completedWithCompensation
    .flatMap((r) => {
      const def = stepDefMap.get(r.stepId);
      if (!def) return [];
      return [{
        stepRowId: r.id,
        stepId: r.stepId,
        compensationToolId: def.compensationToolId,
        compensationInput: r.compensationInput as Record<string, unknown>,
        stepIndex: def.index,
      }];
    })
    .sort((a, b) => b.stepIndex - a.stepIndex);
}

