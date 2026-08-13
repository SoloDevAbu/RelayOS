export type StepType =
  | "AI_PLAN"
  | "TOOL_CALL"
  | "APPROVAL"
  | "CONDITION"
  | "TRANSFORM"
  | "DELAY";

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
}

export interface WorkflowDefinition {
  steps: WorkflowStep[];
  initialStepId: string;
}
