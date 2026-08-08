import { db } from "@relayos/db/client";
import { executions, executionSteps, workflows } from "@relayos/db/schema";
import { eq } from "drizzle-orm";
import type { WorkflowDefinition } from "../types/workflow-definition.js";

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
    });

  return rows;
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
    })
    .from(executionSteps)
    .where(eq(executionSteps.executionId, executionId));
}
