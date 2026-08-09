import { db } from "@relayos/db/client";
import { approvals } from "@relayos/db/schema";
import type { StepHandler, StepHandlerResult } from "./types.js";

function getPrompt(config: Record<string, unknown>): string {
  const prompt = config.prompt;
  if (typeof prompt === "string" && prompt.trim().length > 0) {
    return prompt;
  }
  return "Manual approval required to continue execution.";
}

export const handleApproval: StepHandler = async (
  step,
  context,
): Promise<StepHandlerResult> => {
  const prompt = getPrompt(step.config);
  const stepContext = {
    stepName: step.name,
    triggerPayload: context.triggerPayload,
    completedSteps: context.steps.map((s) => s.stepId),
  };

  await db.insert(approvals).values({
    executionId: context.executionId,
    stepId: step.id,
    prompt,
    context: stepContext,
    status: "PENDING",
  });

  return {
    output: { awaiting: "APPROVAL", stepId: step.id },
    pause: true,
  };
};
