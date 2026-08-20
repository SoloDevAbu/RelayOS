export type StepType =
  | "AI_PLAN"
  | "TOOL_CALL"
  | "APPROVAL"
  | "CONDITION"
  | "TRANSFORM"
  | "DELAY";

export type CompensationStatus = "PENDING" | "RUNNING" | "COMPLETED" | "FAILED";

export type SagaStatus = "COMPENSATING" | "COMPENSATED" | "COMPENSATION_FAILED";

export interface WorkflowStep {
  id: string;
  type: StepType;
  name: string;
  config: Record<string, unknown>;
  onSuccess?: string;
  onFailure?: string;
  maxAttempts?: number;
  onError?: "FAIL" | "SKIP";
  maxIterations?: number;
  compensationToolId?: string;
  compensationInputMapping?: Record<string, string>;
}

export interface WorkflowDefinition {
  steps: WorkflowStep[];
  initialStepId: string;
}
