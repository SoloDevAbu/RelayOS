import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  callAgentPlan,
  AgentServiceError,
  AgentServiceUnreachableError,
} from "./agent-service-client.js";

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
  process.env.AGENT_SERVICE_URL = "http://localhost:3004";
});

const baseRequest = {
  goal: "Summarize the report",
  context: {},
  availableTools: [],
  memories: [] as [],
  iterationHistory: [],
};

describe("callAgentPlan", () => {
  it("returns parsed tool_call response on success", async () => {
    const responseBody = {
      action: "tool_call",
      tool: "search",
      input: { query: "report" },
      reasoning: "Need to find the report first.",
    };
    mockPost.mockResolvedValue({
      statusCode: 200,
      responseBody: JSON.stringify(responseBody),
      latencyMs: 800,
    });

    const result = await callAgentPlan(baseRequest);

    expect(result).toEqual(responseBody);
    expect(mockPost).toHaveBeenCalledWith(
      "http://localhost:3004/internal/plan",
      baseRequest,
      {},
      60_000,
    );
  });

  it("returns complete response", async () => {
    const responseBody = {
      action: "complete",
      summary: "Done.",
      reasoning: "All steps finished.",
    };
    mockPost.mockResolvedValue({
      statusCode: 200,
      responseBody: JSON.stringify(responseBody),
      latencyMs: 500,
    });

    const result = await callAgentPlan(baseRequest);
    expect(result.action).toBe("complete");
  });

  it("returns request_approval response", async () => {
    const responseBody = {
      action: "request_approval",
      message: "Please review before proceeding.",
      reasoning: "Sensitive action detected.",
    };
    mockPost.mockResolvedValue({
      statusCode: 200,
      responseBody: JSON.stringify(responseBody),
      latencyMs: 700,
    });

    const result = await callAgentPlan(baseRequest);
    expect(result.action).toBe("request_approval");
  });

  it("throws AgentServiceError on 5xx response", async () => {
    mockPost.mockResolvedValue({
      statusCode: 500,
      responseBody: "Internal Server Error",
      latencyMs: 100,
    });

    await expect(callAgentPlan(baseRequest)).rejects.toThrow(AgentServiceError);
  });

  it("throws AgentServiceUnreachableError on network failure", async () => {
    mockPost.mockRejectedValue(
      new MockHttpClientError({ message: "ECONNREFUSED", latencyMs: 1 }),
    );

    await expect(callAgentPlan(baseRequest)).rejects.toThrow(
      AgentServiceUnreachableError,
    );
  });

  it("throws AgentServiceUnreachableError on timeout", async () => {
    mockPost.mockRejectedValue(
      new MockHttpClientError({
        message: "Request timed out",
        isTimeout: true,
        latencyMs: 60000,
      }),
    );

    await expect(callAgentPlan(baseRequest)).rejects.toThrow(
      AgentServiceUnreachableError,
    );
  });
});
