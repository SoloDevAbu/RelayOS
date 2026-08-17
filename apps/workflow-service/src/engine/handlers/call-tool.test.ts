import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  callTool,
  ToolCallError,
  ToolRuntimeUnreachableError,
} from "./call-tool.js";

const { mockPost, MockHttpClientError } = vi.hoisted(() => {
  class _MockHttpClientError extends Error {
    public readonly isTimeout: boolean;
    public readonly latencyMs: number;

    constructor(params: {
      message: string;
      isTimeout?: boolean;
      latencyMs: number;
    }) {
      super(params.message);
      this.name = "HttpClientError";
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

beforeEach(() => {
  vi.clearAllMocks();
  process.env.TOOL_RUNTIME_URL = "http://localhost:8080";
});

describe("callTool", () => {
  it("returns parsed output on success", async () => {
    mockPost.mockResolvedValue({
      statusCode: 200,
      responseBody: JSON.stringify({
        success: true,
        output: { result: "ok" },
        durationMs: 40,
      }),
      latencyMs: 40,
    });

    const result = await callTool(
      "my-tool",
      { key: "val" },
      "exec-1",
      "step-1",
      1,
    );

    expect(result.output).toEqual({ result: "ok" });
    expect(result.retryable).toBe(false);
    expect(mockPost).toHaveBeenCalledWith(
      "http://localhost:8080/internal/execute",
      {
        toolId: "my-tool",
        input: { key: "val" },
        executionId: "exec-1",
        stepId: "step-1",
        attempt: 1,
      },
    );
  });

  it("throws ToolCallError with retryable=false on 4xx result", async () => {
    mockPost.mockResolvedValue({
      statusCode: 200,
      responseBody: JSON.stringify({
        success: false,
        error: "Unprocessable",
        retryable: false,
        durationMs: 30,
      }),
      latencyMs: 30,
    });

    await expect(
      callTool("my-tool", {}, "exec-1", "step-1", 1),
    ).rejects.toThrow(ToolCallError);
    try {
      await callTool("my-tool", {}, "exec-1", "step-1", 1);
    } catch (err) {
      expect(err).toBeInstanceOf(ToolCallError);
      expect((err as ToolCallError).retryable).toBe(false);
    }
  });

  it("throws ToolCallError with retryable=true on 5xx result", async () => {
    mockPost.mockResolvedValue({
      statusCode: 200,
      responseBody: JSON.stringify({
        success: false,
        error: "Server Error",
        retryable: true,
        durationMs: 20,
      }),
      latencyMs: 20,
    });

    try {
      await callTool("my-tool", {}, "exec-1", "step-1", 1);
    } catch (err) {
      expect(err).toBeInstanceOf(ToolCallError);
      expect((err as ToolCallError).retryable).toBe(true);
    }
  });

  it("throws ToolRuntimeUnreachableError on network failure", async () => {
    mockPost.mockRejectedValue(
      new MockHttpClientError({ message: "ECONNREFUSED", latencyMs: 1 }),
    );

    await expect(
      callTool("my-tool", {}, "exec-1", "step-1", 1),
    ).rejects.toThrow(ToolRuntimeUnreachableError);
  });

  it("throws ToolRuntimeUnreachableError on timeout", async () => {
    mockPost.mockRejectedValue(
      new MockHttpClientError({
        message: "Request timed out",
        isTimeout: true,
        latencyMs: 10000,
      }),
    );

    await expect(
      callTool("my-tool", {}, "exec-1", "step-1", 1),
    ).rejects.toThrow(ToolRuntimeUnreachableError);
  });
});
