import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  callWebhook,
  WebhookTimeoutError,
  WebhookNetworkError,
} from "./webhook-executor.js";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

function makeResponse(status: number, body: string): Response {
  return {
    status,
    text: () => Promise.resolve(body),
  } as unknown as Response;
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

const baseReq = {
  url: "https://example.com/webhook",
  httpMethod: "POST" as const,
  timeoutMs: 5000,
  authType: "NONE" as const,
  idempotencyKey: "exec-1:step-1:1",
  body: { key: "value" },
};

describe("callWebhook", () => {
  it("returns status and body on success", async () => {
    mockFetch.mockResolvedValue(makeResponse(200, '{"ok":true}'));
    const result = await callWebhook(baseReq);
    expect(result.statusCode).toBe(200);
    expect(result.body).toBe('{"ok":true}');
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("returns non-2xx status without throwing", async () => {
    mockFetch.mockResolvedValue(makeResponse(400, "Bad Request"));
    const result = await callWebhook(baseReq);
    expect(result.statusCode).toBe(400);
  });

  it("returns 500 status without throwing", async () => {
    mockFetch.mockResolvedValue(makeResponse(500, "Internal Server Error"));
    const result = await callWebhook(baseReq);
    expect(result.statusCode).toBe(500);
  });

  it("sets Bearer auth header", async () => {
    mockFetch.mockResolvedValue(makeResponse(200, "{}"));
    await callWebhook({
      ...baseReq,
      authType: "BEARER",
      credential: "mytoken",
    });
    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>)["Authorization"]).toBe("Bearer mytoken");
  });

  it("sets API key header", async () => {
    mockFetch.mockResolvedValue(makeResponse(200, "{}"));
    await callWebhook({
      ...baseReq,
      authType: "API_KEY_HEADER",
      authHeaderName: "X-Custom-Key",
      credential: "secret123",
    });
    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>)["X-Custom-Key"]).toBe("secret123");
  });

  it("sets Basic auth header", async () => {
    mockFetch.mockResolvedValue(makeResponse(200, "{}"));
    await callWebhook({
      ...baseReq,
      authType: "BASIC",
      credential: "user:pass",
    });
    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const expected = "Basic " + Buffer.from("user:pass").toString("base64");
    expect((init.headers as Record<string, string>)["Authorization"]).toBe(expected);
  });

  it("sets Idempotency-Key header", async () => {
    mockFetch.mockResolvedValue(makeResponse(200, "{}"));
    await callWebhook({ ...baseReq, idempotencyKey: "exec-1:step-2:3" });
    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>)["Idempotency-Key"]).toBe("exec-1:step-2:3");
  });

  it("throws WebhookTimeoutError on AbortError", async () => {
    const abortError = new DOMException("Aborted", "AbortError");
    mockFetch.mockRejectedValue(abortError);
    await expect(callWebhook({ ...baseReq, timeoutMs: 1 })).rejects.toThrow(
      WebhookTimeoutError,
    );
  });

  it("throws WebhookNetworkError on network failure", async () => {
    mockFetch.mockRejectedValue(new Error("ECONNREFUSED"));
    await expect(callWebhook(baseReq)).rejects.toThrow(WebhookNetworkError);
  });
});
