import { describe, it, expect } from "vitest";
import { buildPrompt } from "./prompt-builder.js";

describe("buildPrompt", () => {
  it("includes the goal in the user message", () => {
    const result = buildPrompt({
      goal: "do something",
      context: {},
      memories: [],
      iterationHistory: [],
    });

    expect(result.instructions).toContain("You are a planning agent");
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].content).toContain("## Goal\ndo something");
  });

  it("includes context if provided", () => {
    const result = buildPrompt({
      goal: "test",
      context: { key: "value" },
      memories: [],
      iterationHistory: [],
    });

    expect(result.messages[0].content).toContain("## Context\n{");
    expect(result.messages[0].content).toContain('"key": "value"');
  });

  it("includes memories if provided", () => {
    const result = buildPrompt({
      goal: "test",
      context: {},
      memories: [
        { content: "memory1" },
        { content: "memory2", relevance: 0.8 },
      ],
      iterationHistory: [],
    });

    expect(result.messages[0].content).toContain("## Relevant Memories\n- memory1\n- memory2 (relevance: 0.8)");
  });

  it("includes iteration history if provided", () => {
    const result = buildPrompt({
      goal: "test",
      context: {},
      memories: [],
      iterationHistory: [
        {
          action: "tool_call",
          tool: "my_tool",
          input: { arg: 1 },
          result: { ok: true },
          reasoning: "seemed right",
        },
      ],
    });

    expect(result.messages[0].content).toContain("## Iteration History");
    expect(result.messages[0].content).toContain("### Iteration 1");
    expect(result.messages[0].content).toContain("Action: tool_call");
    expect(result.messages[0].content).toContain("Tool: my_tool");
    expect(result.messages[0].content).toContain('Input: {"arg":1}');
    expect(result.messages[0].content).toContain('Result: {"ok":true}');
    expect(result.messages[0].content).toContain("Reasoning: seemed right");
  });
});
