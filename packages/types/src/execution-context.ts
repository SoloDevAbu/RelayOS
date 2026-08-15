export interface IterationEntry {
  action: string;
  tool?: string;
  input?: Record<string, unknown>;
  result?: unknown;
  reasoning?: string;
  decision?: string;
}

export interface StepOutput {
  stepId: string;
  output: unknown;
  completedAt: string;
  iterationHistory?: IterationEntry[];
}

export interface ExecutionContext {
  executionId: string;
  triggerPayload: Record<string, unknown> | null;
  steps: StepOutput[];
}
