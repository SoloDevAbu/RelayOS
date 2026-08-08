import type { WorkflowDefinition, WorkflowStep } from "../types/workflow-definition.js";
import type { StepOutput } from "../types/execution-context.js";
import { stepHandlers } from "./handlers/index.js";
import type { transitionStep as TransitionStepFn } from "./state-machine.js";
import type { getContext as GetContextFn, updateContext as UpdateContextFn } from "./context-manager.js";

export interface StepRunnerDeps {
  transitionStep: typeof TransitionStepFn;
  getContext: typeof GetContextFn;
  updateContext: typeof UpdateContextFn;
}

export interface ExecutionStepRow {
  id: string;
  executionId: string;
  stepId: string;
  stepType: string;
  status: string;
}

export interface StepRunResult {
  success: boolean;
  completedSteps: string[];
  failedStepId?: string;
  error?: string;
}

export async function runSteps(
  executionId: string,
  definition: WorkflowDefinition,
  executionStepRows: ExecutionStepRow[],
  deps: StepRunnerDeps,
): Promise<StepRunResult> {
  const stepMap = new Map<string, WorkflowStep>();
  for (const step of definition.steps) {
    stepMap.set(step.id, step);
  }

  const rowMap = new Map<string, ExecutionStepRow>();
  for (const row of executionStepRows) {
    rowMap.set(row.stepId, row);
  }

  const completedSteps: string[] = [];
  let currentStepId: string | undefined = definition.initialStepId;

  while (currentStepId) {
    const step = stepMap.get(currentStepId);
    if (!step) {
      return {
        success: false,
        completedSteps,
        failedStepId: currentStepId,
        error: `Step definition "${currentStepId}" not found in workflow`,
      };
    }

    const row = rowMap.get(currentStepId);
    if (!row) {
      return {
        success: false,
        completedSteps,
        failedStepId: currentStepId,
        error: `Execution step row for "${currentStepId}" not found`,
      };
    }

    const handler = stepHandlers[step.type];
    if (!handler) {
      return {
        success: false,
        completedSteps,
        failedStepId: currentStepId,
        error: `No handler for step type "${step.type}" — not supported in this phase`,
      };
    }

    await deps.transitionStep(row.id, "PENDING", "RUNNING", {
      startedAt: new Date(),
    });

    try {
      const context = await deps.getContext(executionId);
      const result = await handler(step, context);

      await deps.transitionStep(row.id, "RUNNING", "COMPLETED", {
        output: result.output,
        completedAt: new Date(),
      });

      const stepOutput: StepOutput = {
        stepId: step.id,
        output: result.output,
        completedAt: new Date().toISOString(),
      };
      await deps.updateContext(executionId, stepOutput);

      completedSteps.push(step.id);

      if (result.nextStepId) {
        currentStepId = result.nextStepId;
      } else if (step.onSuccess) {
        currentStepId = step.onSuccess;
      } else {
        currentStepId = undefined;
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      await deps.transitionStep(row.id, "RUNNING", "FAILED", {
        error: errorMessage,
        completedAt: new Date(),
      });

      return {
        success: false,
        completedSteps,
        failedStepId: step.id,
        error: errorMessage,
      };
    }
  }

  return { success: true, completedSteps };
}
