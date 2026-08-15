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

