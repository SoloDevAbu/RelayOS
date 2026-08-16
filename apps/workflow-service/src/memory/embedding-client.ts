import { GoogleGenAI } from "@google/genai";

const MODEL = "gemini-embedding-2-preview";
const DIMENSIONS = 768;

let client: GoogleGenAI | null = null;

function getClient(): GoogleGenAI {
  if (!client) {
    client = new GoogleGenAI({
      apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY!,
    });
  }
  return client;
}

export async function getEmbedding(text: string): Promise<number[]> {
  const ai = getClient();
  const response = await ai.models.embedContent({
    model: MODEL,
    contents: text,
    config: { outputDimensionality: DIMENSIONS },
  });
  return response.embeddings![0]!.values!;
}
