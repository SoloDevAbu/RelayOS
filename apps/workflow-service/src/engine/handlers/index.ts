import { handleToolCall } from "./tool-call.js";
import { handleCondition } from "./condition.js";
import { handleDelay } from "./delay.js";
import type { StepHandler } from "./types.js";

export const stepHandlers: Record<string, StepHandler> = {
  TOOL_CALL: handleToolCall,
  CONDITION: handleCondition,
  DELAY: handleDelay,
};

export { handleToolCall, handleCondition, handleDelay };
export type { StepHandler, StepHandlerResult } from "./types.js";
