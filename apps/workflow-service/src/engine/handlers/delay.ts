import type { StepHandler, StepHandlerResult } from "./types.js";

export const handleDelay: StepHandler = async (
  step,
  _context,
): Promise<StepHandlerResult> => {
  const durationMs = step.config.durationMs;

  if (typeof durationMs !== "number" || durationMs < 0) {
    throw new Error(`Invalid delay duration: ${durationMs}`);
  }

  await new Promise((resolve) => setTimeout(resolve, durationMs));

  return { output: { delayed: true, durationMs } };
};
