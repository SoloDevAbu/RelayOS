export interface WorkflowExecuteJob {
  executionId: string;
  workflowId: string;
  projectId: string;
  payload?: Record<string, unknown>;
  resumeFromStepId?: string;
  approvalDecision?: "APPROVED" | "REJECTED";
}
