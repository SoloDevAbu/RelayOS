import { describe, it, expect } from "vitest";
import {
  shapeSuccess,
  shapeHttpError,
  shapeError,
} from "./result-shaper.js";
import { WebhookTimeoutError, WebhookNetworkError } from "./webhook-executor.js";

describe("shapeSuccess", () => {
  it("returns success with parsed JSON body", () => {
    const result = shapeSuccess({ statusCode: 200, body: '{"data":1}', durationMs: 50 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.output).toEqual({ data: 1 });
      expect(result.statusCode).toBe(200);
      expect(result.durationMs).toBe(50);
    }
  });

  it("returns success with raw string if body is not JSON", () => {
    const result = shapeSuccess({ statusCode: 200, body: "plain text", durationMs: 10 });
    expect(result.success).toBe(true);
    if (result.success) expect(result.output).toBe("plain text");
  });
});

describe("shapeHttpError", () => {
  it("marks 4xx as retryable=false", () => {
    const result = shapeHttpError({ statusCode: 400, body: "Bad Request", durationMs: 20 });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.retryable).toBe(false);
      expect(result.statusCode).toBe(400);
    }
  });

  it("marks 422 as retryable=false", () => {
    const result = shapeHttpError({ statusCode: 422, body: "Unprocessable", durationMs: 20 });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.retryable).toBe(false);
  });

  it("marks 500 as retryable=true", () => {
    const result = shapeHttpError({ statusCode: 500, body: "Server Error", durationMs: 20 });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.retryable).toBe(true);
  });

  it("marks 503 as retryable=true", () => {
    const result = shapeHttpError({ statusCode: 503, body: "Unavailable", durationMs: 20 });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.retryable).toBe(true);
  });
});

describe("shapeError", () => {
  it("marks WebhookTimeoutError as retryable=true", () => {
    const result = shapeError(new WebhookTimeoutError(5000));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.retryable).toBe(true);
      expect(result.error).toContain("timed out");
    }
  });

  it("marks WebhookNetworkError as retryable=true", () => {
    const result = shapeError(new WebhookNetworkError("ECONNREFUSED", 100));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.retryable).toBe(true);
      expect(result.error).toContain("Network error");
    }
  });

  it("marks unknown errors as retryable=false", () => {
    const result = shapeError(new Error("unexpected"));
    expect(result.success).toBe(false);
    if (!result.success) expect(result.retryable).toBe(false);
  });
});
