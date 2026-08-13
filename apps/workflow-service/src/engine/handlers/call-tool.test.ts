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
      responseBody: JSON.stringify({ result: "ok" }),
      latencyMs: 40,
    });

    const result = await callTool("my-tool", { key: "val" }, "exec-1");

    expect(result.output).toEqual({ result: "ok" });
    expect(mockPost).toHaveBeenCalledWith(
      "http://localhost:8080/v1/tools/my-tool/execute",
      { input: { key: "val" }, executionId: "exec-1" },
    );
  });

  it("throws ToolCallError on 4xx response", async () => {
    mockPost.mockResolvedValue({
      statusCode: 422,
      responseBody: "Unprocessable",
      latencyMs: 30,
    });

    await expect(callTool("my-tool", {}, "exec-1")).rejects.toThrow(
      ToolCallError,
    );
  });

  it("throws ToolRuntimeUnreachableError on network failure", async () => {
    mockPost.mockRejectedValue(
      new MockHttpClientError({ message: "ECONNREFUSED", latencyMs: 1 }),
    );

    await expect(callTool("my-tool", {}, "exec-1")).rejects.toThrow(
      ToolRuntimeUnreachableError,
    );
  });

  it("throws ToolRuntimeUnreachableError on timeout", async () => {
    mockPost.mockRejectedValue(
      new MockHttpClientError({
        message: "Request timed out",
        isTimeout: true,
        latencyMs: 10000,
      }),
    );

    await expect(callTool("my-tool", {}, "exec-1")).rejects.toThrow(
      ToolRuntimeUnreachableError,
    );
  });
});
