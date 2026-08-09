import { handleToolCall } from "./tool-call.js";
import { handleCondition } from "./condition.js";
import { handleDelay } from "./delay.js";
import { handleTransform } from "./transform.js";
import { handleApproval } from "./approval.js";
import type { StepHandler } from "./types.js";

export const stepHandlers: Record<string, StepHandler> = {
  TOOL_CALL: handleToolCall,
  CONDITION: handleCondition,
  DELAY: handleDelay,
  TRANSFORM: handleTransform,
  APPROVAL: handleApproval,
};

export { handleToolCall, handleCondition, handleDelay, handleTransform, handleApproval };
export type { StepHandler, StepHandlerResult } from "./types.js";
