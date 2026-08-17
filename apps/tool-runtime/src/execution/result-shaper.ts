import type { ToolExecutionResult } from "@relayos/types";
import type { WebhookResponse } from "./webhook-executor.js";
import { WebhookTimeoutError, WebhookNetworkError } from "./webhook-executor.js";

/**
 * Converts raw webhook outcomes or errors into the shared ToolExecutionResult shape.
 *
 * Retryability rules:
 *   - 2xx: success
 *   - 4xx: retryable=false — the input was rejected; retrying won't fix it
 *   - 5xx: retryable=true — the server errored; may recover
 *   - timeout: retryable=true — may have been a transient overload
 *   - network error: retryable=true — connectivity issue, may recover
 */
export function shapeSuccess(
  response: WebhookResponse,
): ToolExecutionResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(response.body);
  } catch {
    parsed = response.body;
  }
  return {
    success: true,
    output: parsed,
    durationMs: response.durationMs,
    statusCode: response.statusCode,
  };
}

export function shapeHttpError(
  response: WebhookResponse,
): ToolExecutionResult {
  const retryable = response.statusCode >= 500;
  return {
    success: false,
    error: `HTTP ${response.statusCode}: ${response.body.slice(0, 500)}`,
    retryable,
    durationMs: response.durationMs,
    statusCode: response.statusCode,
  };
}

export function shapeError(
  error: unknown,
): ToolExecutionResult {
  if (error instanceof WebhookTimeoutError) {
    return {
      success: false,
      error: "Tool call timed out",
      retryable: true,
      durationMs: error.durationMs,
    };
  }

  if (error instanceof WebhookNetworkError) {
    return {
      success: false,
      error: `Network error: ${error.message}`,
      retryable: true,
      durationMs: error.durationMs,
    };
  }

  return {
    success: false,
    error: error instanceof Error ? error.message : "Unknown error",
    retryable: false,
    durationMs: 0,
  };
}

/**
 * Shapes any webhook outcome — response or thrown error — into ToolExecutionResult.
 */
export function shapeWebhookResult(
  outcomeOrError: WebhookResponse | unknown,
  isError: boolean,
): ToolExecutionResult {
  if (isError) {
    return shapeError(outcomeOrError);
  }

  const response = outcomeOrError as WebhookResponse;
  if (response.statusCode >= 200 && response.statusCode < 300) {
    return shapeSuccess(response);
  }

  return shapeHttpError(response);
}
