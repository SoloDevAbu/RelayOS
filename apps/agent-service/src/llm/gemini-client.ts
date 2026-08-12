import { generateText, type GenerateTextResult, type ToolSet } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import type { ModelMessage } from "ai";

export const MODEL_NAME = process.env.GEMINI_MODEL || "gemini-2.0-flash";

const google = createGoogleGenerativeAI();

export async function callLlm(
  instructions: string,
  messages: ModelMessage[],
  tools: ToolSet,
): Promise<GenerateTextResult<ToolSet, never, never>> {
  return generateText({
    model: google(MODEL_NAME),
    instructions,
    messages,
    tools,
    toolChoice: "required",
  });
}
