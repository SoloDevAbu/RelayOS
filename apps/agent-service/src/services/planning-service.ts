import type { PlanRequest, PlanResponse } from "../schemas/plan.js";
import { buildPrompt } from "../prompt/prompt-builder.js";
import { formatTools } from "../prompt/tool-formatter.js";
import { callLlm } from "../llm/gemini-client.js";
import { parseResponse } from "../parsing/response-parser.js";
import type { FastifyBaseLogger } from "fastify";

export async function plan(
  input: PlanRequest,
  log: FastifyBaseLogger,
): Promise<PlanResponse> {
  const prompt = buildPrompt({
    goal: input.goal,
    context: input.context,
    memories: input.memories,
    iterationHistory: input.iterationHistory,
  });

  const tools = formatTools(input.availableTools);

  log.debug({ toolCount: input.availableTools.length }, "Calling LLM");

  const result = await callLlm(prompt, tools);

  const response = parseResponse(result);

  log.info(
    { action: response.action, model: "gemini-2.0-flash" },
    "Plan decision",
  );

  return response;
}
