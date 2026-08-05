export const QUEUES = {
  WORKFLOW_EXECUTE: "workflow-execute",
  WORKFLOW_RETRY: "workflow-retry",
  WORKFLOW_SCHEDULE: "workflow-schedule",
  MEMORY_EMBED: "memory-embed",
} as const;

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];

export interface WorkflowExecuteJob {
  executionId: string;
  workflowId: string;
  projectId: string;
  payload?: Record<string, unknown>;
  resumeFromStepId?: string;
  approvalDecision?: "APPROVED" | "REJECTED";
}
