import type { ModelMessage } from "ai";
import type { PlanRequest } from "../schemas/plan.js";
import { META_TOOL_NAMES } from "./tool-formatter.js";

const SYSTEM_PROMPT = `You are a planning agent for RelayOS, an AI workflow execution platform.

Your job is to decide the SINGLE next action to take toward completing a goal.

You MUST call exactly one tool per invocation:
- Call one of the available workflow tools to make progress toward the goal.
- Call "${META_TOOL_NAMES.complete}" when all necessary work is done and the goal is fully satisfied.
- Call "${META_TOOL_NAMES.approval}" when you are uncertain, the task is ambiguous, or a decision requires human judgment.

Rules:
- You make ONE decision per invocation. Do not try to plan multiple steps ahead.
- If the iteration history shows a tool was already called and its result satisfies the goal, call "${META_TOOL_NAMES.complete}".
- If no tool is appropriate and the goal cannot be completed, call "${META_TOOL_NAMES.approval}" rather than guessing.
- When calling a workflow tool, provide the input exactly as the tool's schema requires.`;

export interface PromptOutput {
  instructions: string;
  messages: ModelMessage[];
}

export function buildPrompt(input: {
  goal: PlanRequest["goal"];
  context: PlanRequest["context"];
  memories: PlanRequest["memories"];
  iterationHistory: PlanRequest["iterationHistory"];
}): PromptOutput {
  const userParts: string[] = [`## Goal\n${input.goal}`];

  if (Object.keys(input.context).length > 0) {
    userParts.push(`## Context\n${JSON.stringify(input.context, null, 2)}`);
  }

  if (input.memories.length > 0) {
    const memoryText = input.memories
      .map(
        (m) =>
          `- ${m.content}${m.relevance != null ? ` (relevance: ${m.relevance})` : ""}`,
      )
      .join("\n");
    userParts.push(`## Relevant Memories\n${memoryText}`);
  }

  if (input.iterationHistory.length > 0) {
    const historyText = input.iterationHistory
      .map((entry, i) => {
        const parts = [`### Iteration ${i + 1}`, `Action: ${entry.action}`];
        if (entry.tool) parts.push(`Tool: ${entry.tool}`);
        if (entry.input) parts.push(`Input: ${JSON.stringify(entry.input)}`);
        if (entry.result !== undefined)
          parts.push(`Result: ${JSON.stringify(entry.result)}`);
        if (entry.reasoning) parts.push(`Reasoning: ${entry.reasoning}`);
        return parts.join("\n");
      })
      .join("\n\n");
    userParts.push(`## Iteration History\n${historyText}`);
  }

  return {
    instructions: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userParts.join("\n\n") }],
  };
}
