import type { PlanRequest, PlanResponse } from "../schemas/plan.js";
import { buildPrompt } from "../prompt/prompt-builder.js";
import { formatTools, META_TOOL_NAMES } from "../prompt/tool-formatter.js";
import { callLlm, MODEL_NAME } from "../llm/gemini-client.js";
import type { FastifyBaseLogger } from "fastify";
import { PlanningError } from "../lib/planning-error.js";

export async function plan(
  input: PlanRequest,
  log: FastifyBaseLogger,
): Promise<PlanResponse> {
  const { instructions, messages } = buildPrompt({
    goal: input.goal,
    context: input.context,
    memories: input.memories,
    iterationHistory: input.iterationHistory,
  });

  const tools = formatTools(input.availableTools);

  log.debug({ toolCount: input.availableTools.length }, "Calling LLM");

  let result;
  try {
    result = await callLlm(instructions, messages, tools);
  } catch (error) {
    throw new PlanningError("LLM_CALL_FAILED", "Failed to call LLM", {
      cause: error,
    });
  }

  log.debug(
    {
      finishReason: result.finishReason,
      toolCallCount: result.toolCalls?.length ?? 0,
    },
    "LLM result received",
  );

  if (result.finishReason === "content-filter") {
    throw new PlanningError(
      "MODEL_CONTENT_FILTERED",
      "The model's response was blocked by a content filter.",
      { finishReason: result.finishReason, rawText: result.text },
    );
  }

  const toolCall = result.toolCalls?.[0];

  if (!toolCall) {
    if (result.finishReason === "length") {
      throw new PlanningError(
        "MODEL_TRUNCATED",
        "The model's response was truncated before it could decide on an action.",
        { finishReason: result.finishReason, rawText: result.text },
      );
    }
    throw new PlanningError(
      "MODEL_NO_TOOL_CALL",
      "The model did not call a tool (real or meta) and gave no actionable output.",
      { finishReason: result.finishReason, rawText: result.text },
    );
  }

  const call = result.toolCalls[0]!;
  const args = (call.input ?? {}) as Record<string, unknown>;

  if (call.toolName === META_TOOL_NAMES.complete) {
    log.info({ action: "complete", model: MODEL_NAME }, "Plan decision");
    return {
      action: "complete",
      summary: (args.summary as string) || "Goal completed.",
      reasoning: result.text || "The model indicated the goal is satisfied.",
    };
  }

  if (call.toolName === META_TOOL_NAMES.approval) {
    log.info(
      { action: "request_approval", model: MODEL_NAME },
      "Plan decision",
    );
    return {
      action: "request_approval",
      message:
        result.text ||
        "The model did not select a tool. Human review is needed.",
      reasoning:
        "No tool call was made — the model may not have understood the available tools.",
    };
  }

  log.info(
    { action: "tool_call", tool: call.toolName, model: MODEL_NAME },
    "Plan decision",
  );
  return {
    action: "tool_call",
    tool: call.toolName,
    input: args,
    reasoning: result.text || "Tool call selected by the model.",
  };
}
