export interface StepOutput {
  stepId: string;
  output: unknown;
  completedAt: string;
}

export interface ExecutionContext {
  executionId: string;
  triggerPayload: Record<string, unknown> | null;
  steps: StepOutput[];
}
