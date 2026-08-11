import { generateText, type GenerateTextResult, type ToolSet } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";

const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.0-flash";

const google = createGoogleGenerativeAI();

export async function callLlm(
  prompt: string,
  tools: ToolSet,
): Promise<GenerateTextResult<ToolSet, never, never>> {
  return generateText({
    model: google(GEMINI_MODEL),
    prompt,
    tools,
  });
}
