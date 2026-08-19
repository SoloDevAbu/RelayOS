export const QUEUES = {
  WORKFLOW_EXECUTE: "workflow-execute",
  WORKFLOW_RETRY: "workflow-retry",
  WORKFLOW_SCHEDULE: "workflow-schedule",
  MEMORY_EMBED: "memory-embed",
  WORKFLOW_DLQ: "workflow-dlq",
} as const;

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];
