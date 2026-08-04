import { Queue, QUEUES, bullmqRedis, type WorkflowExecuteJob } from "@relayos/queue";
import { executions } from "@relayos/db/schema";
import type { db as DrizzleDb } from "@relayos/db/client";

const workflowQueue = new Queue<WorkflowExecuteJob>(QUEUES.WORKFLOW_EXECUTE, {
  connection: bullmqRedis,
});

export async function insertAndEnqueue(
  params: {
    workflowId: string;
    projectId: string;
    payload?: Record<string, unknown>;
  },
  db: typeof DrizzleDb,
): Promise<string> {
  const { workflowId, projectId, payload } = params;

  const [row] = await db
    .insert(executions)
    .values({
      workflowId,
      projectId,
      triggerPayload: payload ?? null,
      status: "PENDING",
    })
    .returning({ id: executions.id });

  if (!row) throw new Error("Failed to insert execution row");

  const jobPayload: WorkflowExecuteJob = {
    executionId: row.id,
    workflowId,
    projectId,
    payload,
  };

  await workflowQueue.add(QUEUES.WORKFLOW_EXECUTE, jobPayload);

  return row.id;
}
