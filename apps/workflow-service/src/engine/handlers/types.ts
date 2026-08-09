import type { WorkflowStep } from "../../types/workflow-definition.js";
import type { ExecutionContext } from "../../types/execution-context.js";

export interface StepHandlerResult {
  output: unknown;
  nextStepId?: string;
  pause?: boolean;
}

export type StepHandler = (
  step: WorkflowStep,
  context: ExecutionContext,
) => Promise<StepHandlerResult>;
