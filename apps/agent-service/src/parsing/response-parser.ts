import type { GenerateTextResult, ToolSet } from "ai";
import type { PlanResponse } from "../schemas/plan.js";

export function parseResponse(
  result: GenerateTextResult<ToolSet, never, never>,
): PlanResponse {
  if (result.toolCalls && result.toolCalls.length > 0) {
    const firstCall = result.toolCalls[0]!;
    return {
      action: "tool_call" as const,
      tool: firstCall.toolName,
      input: (firstCall.input ?? {}) as Record<string, unknown>,
      reasoning: result.text || "Tool call selected by the model.",
    };
  }

  const text = result.text ?? "";

  if (looksLikeCompletion(text)) {
    return {
      action: "complete" as const,
      summary: text,
      reasoning: "The model indicated the goal is satisfied.",
    };
  }

  return {
    action: "request_approval" as const,
    message:
      "The planner could not determine a clear next step. Human review is needed.",
    reasoning: text || "No tool call was made and the response was ambiguous.",
  };
}

function looksLikeCompletion(text: string): boolean {
  if (!text.trim()) return false;

  const completionSignals = [
    "goal is complete",
    "goal has been completed",
    "task is complete",
    "task is done",
    "goal is satisfied",
    "goal is fulfilled",
    "successfully completed",
    "all done",
    "nothing more to do",
    "no further action",
  ];

  const lower = text.toLowerCase();
  return completionSignals.some((signal) => lower.includes(signal));
}
