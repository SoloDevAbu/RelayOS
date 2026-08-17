import type { WorkflowDefinition, WorkflowStep } from "@relayos/types";
import type { StepOutput } from "@relayos/types";
import type { WorkflowRetryJob } from "@relayos/queue";
import { stepHandlers } from "./handlers/index.js";
import { ToolCallError } from "./handlers/tool-call.js";
import { decideRetry } from "./retry-policy.js";
import type { transitionStep as TransitionStepFn } from "./state-machine.js";
import type { getContext as GetContextFn, updateContext as UpdateContextFn } from "./context-manager.js";

export interface StepRunnerDeps {
  transitionStep: typeof TransitionStepFn;
  getContext: typeof GetContextFn;
  updateContext: typeof UpdateContextFn;
  enqueueRetry: (job: WorkflowRetryJob, delayMs: number) => Promise<void>;
}

export interface ExecutionStepRow {
  id: string;
  executionId: string;
  stepId: string;
  stepType: string;
  status: string;
  attempt: number;
}

export interface RunStepsOptions {
  startFromStepId?: string;
}

export interface StepRunResult {
  success: boolean;
  completedSteps: string[];
  failedStepId?: string;
  error?: string;
  retryEnqueued?: boolean;
  pausedAtStepId?: string;
}

export async function runSteps(
  executionId: string,
  workflowId: string,
  projectId: string,
  definition: WorkflowDefinition,
  executionStepRows: ExecutionStepRow[],
  deps: StepRunnerDeps,
  options: RunStepsOptions = {},
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
  let skipUntilReached = options.startFromStepId !== undefined;

  while (currentStepId) {
    if (skipUntilReached) {
      if (currentStepId === options.startFromStepId) {
        skipUntilReached = false;
      } else {
        const step = stepMap.get(currentStepId);
        currentStepId = step?.onSuccess;
        continue;
      }
    }

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

    if (row.status === "PENDING") {
      await deps.transitionStep(row.id, "PENDING", "RUNNING", {
        startedAt: new Date(),
      });
    }

    try {
      const context = await deps.getContext(executionId);
      const result = await handler(step, context, row.attempt);

      if (result.pause) {
        await deps.transitionStep(row.id, "RUNNING", "WAITING_APPROVAL");
        return { success: false, completedSteps, pausedAtStepId: step.id };
      }

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

      const retryable = error instanceof ToolCallError ? error.retryable : undefined;

      const decision = decideRetry(
        {
          maxAttempts: step.maxAttempts ?? 1,
          onError: step.onError ?? "FAIL",
          retryable,
        },
        row.attempt,
      );

      if (decision.action === "retry") {
        await deps.enqueueRetry(
          {
            executionId,
            workflowId,
            projectId,
            stepId: step.id,
            attempt: row.attempt + 1,
          },
          decision.delayMs,
        );

        return { success: false, completedSteps, retryEnqueued: true };
      }

      if (decision.action === "skip") {
        await deps.transitionStep(row.id, "FAILED", "SKIPPED");

        if (step.onSuccess) {
          currentStepId = step.onSuccess;
          continue;
        }

        currentStepId = undefined;
        continue;
      }

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
