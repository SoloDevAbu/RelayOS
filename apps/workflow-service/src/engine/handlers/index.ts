import { handleToolCall } from "./tool-call.js";
import { handleCondition } from "./condition.js";
import { handleDelay } from "./delay.js";
import { handleTransform } from "./transform.js";
import { handleApproval } from "./approval.js";
import { handleAiPlan } from "./ai-plan.js";
import type { StepHandler } from "./types.js";

export const stepHandlers: Record<string, StepHandler> = {
  TOOL_CALL: handleToolCall,
  CONDITION: handleCondition,
  DELAY: handleDelay,
  TRANSFORM: handleTransform,
  APPROVAL: handleApproval,
  AI_PLAN: handleAiPlan,
};

export {
  handleToolCall,
  handleCondition,
  handleDelay,
  handleTransform,
  handleApproval,
  handleAiPlan,
};
export type { StepHandler, StepHandlerResult } from "./types.js";
