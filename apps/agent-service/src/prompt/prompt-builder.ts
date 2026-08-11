import type { PlanRequest } from "../schemas/plan.js";

const SYSTEM_PROMPT = `You are a planning agent for an AI workflow execution platform called RelayOS.

Your job is to decide the SINGLE next action to take toward completing a goal.

You have three options:
1. Call one of the available tools — pick the most relevant tool and provide its input.
2. Mark the goal as complete — only when all necessary work is done and the goal is fully satisfied.
3. Request human approval — when you are uncertain, the task is ambiguous, or a decision requires human judgment.

Rules:
- You make ONE decision per invocation. Do not try to plan multiple steps ahead.
- If the iteration history shows a tool was already called and its result satisfies the goal, mark complete.
- If no tool is appropriate and the goal cannot be completed, request approval rather than guessing.
- Always explain your reasoning.
- When calling a tool, provide the input exactly as the tool's schema requires.
- Must ask for human approval if the tool explicitely asked for`;

export function buildPrompt(input: {
  goal: PlanRequest["goal"];
  context: PlanRequest["context"];
  memories: PlanRequest["memories"];
  iterationHistory: PlanRequest["iterationHistory"];
}): string {
  const sections: string[] = [SYSTEM_PROMPT, "", `## Goal\n${input.goal}`];

  if (Object.keys(input.context).length > 0) {
    sections.push(`## Context\n${JSON.stringify(input.context, null, 2)}`);
  }

  if (input.memories.length > 0) {
    const memoryText = input.memories
      .map(
        (m) =>
          `- ${m.content}${m.relevance != null ? ` (relevance: ${m.relevance})` : ""}`,
      )
      .join("\n");
    sections.push(`## Relevant Memories\n${memoryText}`);
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
    sections.push(`## Iteration History\n${historyText}`);
  }

  return sections.join("\n\n");
}
