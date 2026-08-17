import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  handleToolCall,
  ToolCallError,
  ToolRuntimeUnreachableError,
} from "./tool-call.js";
import type { WorkflowStep } from "@relayos/types";
import type { ExecutionContext } from "@relayos/types";

const { mockPost, MockHttpClientError } = vi.hoisted(() => {
  class _MockHttpClientError extends Error {
    public readonly statusCode?: number;
    public readonly responseBody?: string;
    public readonly isTimeout: boolean;
    public readonly latencyMs: number;

    constructor(params: {
      message: string;
      statusCode?: number;
      responseBody?: string;
      isTimeout?: boolean;
      latencyMs: number;
    }) {
      super(params.message);
      this.name = "HttpClientError";
      this.statusCode = params.statusCode;
      this.responseBody = params.responseBody;
      this.isTimeout = params.isTimeout ?? false;
      this.latencyMs = params.latencyMs;
    }
  }

  return {
    mockPost: vi.fn(),
    MockHttpClientError: _MockHttpClientError,
  };
});

vi.mock("@relayos/lib/http-client", () => ({
  post: (...args: unknown[]) => mockPost(...args),
  HttpClientError: MockHttpClientError,
}));

const baseStep: WorkflowStep = {
  id: "step-1",
  type: "TOOL_CALL",
  name: "Call API",
  config: {
    toolId: "tool-abc",
    input: { query: "test" },
  },
};

const baseContext: ExecutionContext = {
  executionId: "exec-1",
  projectId: "project-1",
  triggerPayload: null,
  steps: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  process.env.TOOL_RUNTIME_URL = "http://localhost:8080";
});

describe("handleToolCall", () => {
  it("returns parsed output on successful tool call", async () => {
    mockPost.mockResolvedValue({
      statusCode: 200,
      responseBody: JSON.stringify({
        success: true,
        output: { result: "success" },
        durationMs: 50,
      }),
      latencyMs: 50,
    });

    const result = await handleToolCall(baseStep, baseContext);

    expect(result.output).toEqual({ result: "success" });
    expect(mockPost).toHaveBeenCalledWith(
      "http://localhost:8080/internal/execute",
      {
        toolId: "tool-abc",
        input: { query: "test" },
        executionId: "exec-1",
        stepId: "step-1",
        attempt: 1,
      },
    );
  });

  it("throws ToolCallError on 4xx/5xx response", async () => {
    mockPost.mockResolvedValue({
      statusCode: 200,
      responseBody: JSON.stringify({
        success: false,
        error: "bad request",
        retryable: false,
        durationMs: 30,
      }),
      latencyMs: 30,
    });

    await expect(handleToolCall(baseStep, baseContext)).rejects.toThrow(
      ToolCallError,
    );

    try {
      await handleToolCall(baseStep, baseContext);
    } catch (err) {
      expect(err).toBeInstanceOf(ToolCallError);
      expect((err as ToolCallError).retryable).toBe(false);
    }
  });

  it("throws ToolRuntimeUnreachableError on network/timeout error", async () => {
    mockPost.mockRejectedValue(
      new MockHttpClientError({
        message: "Request timed out",
        isTimeout: true,
        latencyMs: 10000,
      }),
    );

    await expect(handleToolCall(baseStep, baseContext)).rejects.toThrow(
      ToolRuntimeUnreachableError,
    );
  });

  it("throws ToolCallError when toolId is missing from config", async () => {
    const badStep: WorkflowStep = {
      ...baseStep,
      config: { input: { query: "test" } },
    };

    await expect(handleToolCall(badStep, baseContext)).rejects.toThrow(
      ToolCallError,
    );
    expect(mockPost).not.toHaveBeenCalled();
  });

  it("throws ToolCallError when input is missing from config", async () => {
    const badStep: WorkflowStep = {
      ...baseStep,
      config: { toolId: "tool-abc" },
    };

    await expect(handleToolCall(badStep, baseContext)).rejects.toThrow(
      ToolCallError,
    );
    expect(mockPost).not.toHaveBeenCalled();
  });
});
