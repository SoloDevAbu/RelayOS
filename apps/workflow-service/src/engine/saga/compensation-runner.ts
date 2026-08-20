import { callTool } from "../handlers/call-tool.js";
import {
  transitionCompensationStatus,
} from "../state-machine.js";

export interface CompensatableStep {
  stepRowId: string;
  stepId: string;
  compensationToolId: string;
  compensationInput: Record<string, unknown>;
  executionId: string;
}

export interface CompensationRunnerDeps {
  callTool: typeof callTool;
  transitionCompensationStatus: typeof transitionCompensationStatus;
}

export async function runCompensation(
  step: CompensatableStep,
  deps: CompensationRunnerDeps,
): Promise<"completed" | "failed"> {
  await deps.transitionCompensationStatus(step.stepRowId, "PENDING", "RUNNING");

  try {
    const result = await deps.callTool(
      step.compensationToolId,
      step.compensationInput,
      step.executionId,
      step.stepId,
      1,
    );

    await deps.transitionCompensationStatus(step.stepRowId, "RUNNING", "COMPLETED", {
      compensationOutput: result.output,
      compensatedAt: new Date(),
    });

    return "completed";
  } catch (error) {
    const errorOutput = {
      error: error instanceof Error ? error.message : String(error),
    };

    await deps.transitionCompensationStatus(step.stepRowId, "RUNNING", "FAILED", {
      compensationOutput: errorOutput,
    });

    return "failed";
  }
}
