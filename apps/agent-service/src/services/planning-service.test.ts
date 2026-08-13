import { describe, it, expect, vi, beforeEach } from "vitest";
import { plan } from "./planning-service.js";
import { callLlm } from "../llm/gemini-client.js";
import type { FastifyBaseLogger } from "fastify";
import { PlanningError } from "../lib/planning-error.js";
import { META_TOOL_NAMES } from "../prompt/tool-formatter.js";

vi.mock("../llm/gemini-client.js", () => ({
  callLlm: vi.fn(),
  MODEL_NAME: "test-model",
}));

describe("planning-service", () => {
  const mockLog = {
    debug: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    trace: vi.fn(),
    fatal: vi.fn(),
    child: vi.fn(),
  } as unknown as FastifyBaseLogger;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const baseInput = {
    goal: "test goal",
    context: {},
    memories: [],
    iterationHistory: [],
    availableTools: [],
  };

  it("handles a normal tool call from the LLM", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce({
      toolCalls: [{ toolName: "some_tool", input: { arg: 1 } }],
      text: "I am calling a tool",
      finishReason: "tool-calls",
    } as any);

    const result = await plan(baseInput, mockLog);

    expect(result).toEqual({
      action: "tool_call",
      tool: "some_tool",
      input: { arg: 1 },
      reasoning: "I am calling a tool",
    });
  });

  it("handles mark_goal_complete meta tool", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce({
      toolCalls: [{ toolName: META_TOOL_NAMES.complete, input: { summary: "done" } }],
      text: "Goal is satisfied",
      finishReason: "tool-calls",
    } as any);

    const result = await plan(baseInput, mockLog);

    expect(result).toEqual({
      action: "complete",
      summary: "done",
      reasoning: "Goal is satisfied",
    });
  });

  it("handles request_human_approval meta tool", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce({
      toolCalls: [{ toolName: META_TOOL_NAMES.approval, input: { message: "need help" } }],
      text: "Not sure what to do",
      finishReason: "tool-calls",
    } as any);

    const result = await plan(baseInput, mockLog);

    expect(result).toEqual({
      action: "request_approval",
      message: "Not sure what to do",
      reasoning: "No tool call was made — the model may not have understood the available tools.",
    });
  });

  it("throws PlanningError if LLM call fails", async () => {
    vi.mocked(callLlm).mockRejectedValueOnce(new Error("Network error"));

    await expect(plan(baseInput, mockLog)).rejects.toThrow(PlanningError);
  });

  it("throws PlanningError if response is content-filtered", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce({
      finishReason: "content-filter",
      text: "",
    } as any);

    await expect(plan(baseInput, mockLog)).rejects.toThrow(PlanningError);
  });

  it("throws PlanningError if response is truncated without tool call", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce({
      finishReason: "length",
      text: "some partial text",
    } as any);

    await expect(plan(baseInput, mockLog)).rejects.toThrow(PlanningError);
  });

  it("throws PlanningError if model did not output any tool call", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce({
      finishReason: "stop",
      text: "I forgot to call a tool",
    } as any);

    await expect(plan(baseInput, mockLog)).rejects.toThrow(PlanningError);
  });
});
