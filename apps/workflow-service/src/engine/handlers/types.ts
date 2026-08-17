import type { WorkflowStep } from "@relayos/types";
import type { ExecutionContext } from "@relayos/types";

export interface StepHandlerResult {
  output: unknown;
  nextStepId?: string;
  pause?: boolean;
}

export type StepHandler = (
  step: WorkflowStep,
  context: ExecutionContext,
  attempt?: number,
) => Promise<StepHandlerResult>;
