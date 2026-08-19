export interface WorkflowExecuteJob {
  executionId: string;
  workflowId: string;
  projectId: string;
  payload?: Record<string, unknown>;
  resumeFromStepId?: string;
  approvalDecision?: "APPROVED" | "REJECTED";
}

export interface WorkflowRetryJob {
  executionId: string;
  workflowId: string;
  projectId: string;
  stepId: string;
  attempt: number;
}

export interface MemoryEmbedJob {
  content: string;
  scope: "EXECUTION" | "KNOWLEDGE";
  executionId?: string;
  projectId: string;
  sourceStepId?: string;
}

export interface DlqJob {
  executionId: string;
  workflowId: string;
  projectId: string;
  stepId: string;
  stepType: string;
  executionStepRowId: string;
  attempt: number;
  onError: "FAIL" | "SKIP";
  isSaga: boolean;
  failureError: string;
  failedAt: string;
  iterationHistory?: unknown[];
}

export const DLQ_DEFAULT_JOB_OPTIONS = {
  removeOnComplete: false,
  removeOnFail: false,
  attempts: 1,
} as const;
