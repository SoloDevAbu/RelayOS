import { post, HttpClientError } from "@relayos/lib/http-client";
import type { ToolExecutionResult } from "@relayos/types";

export class ToolCallError extends Error {
  constructor(
    message: string,
    public readonly toolId: string,
    public readonly retryable: boolean,
    public readonly statusCode?: number,
    public readonly responseBody?: string,
  ) {
    super(message);
    this.name = "ToolCallError";
  }
}

export class ToolRuntimeUnreachableError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "ToolRuntimeUnreachableError";
  }
}

export function getToolRuntimeUrl(): string {
  return process.env.TOOL_RUNTIME_URL ?? "http://localhost:8080";
}

export async function callTool(
  toolId: string,
  input: Record<string, unknown>,
  executionId: string,
  stepId: string,
  attempt: number,
): Promise<{ output: unknown; retryable: boolean }> {
  const url = `${getToolRuntimeUrl()}/internal/execute`;

  try {
    const response = await post(url, {
      toolId,
      input,
      executionId,
      stepId,
      attempt,
    });

    let result: ToolExecutionResult;
    try {
      result = JSON.parse(response.responseBody) as ToolExecutionResult;
    } catch {
      throw new ToolCallError(
        `Tool runtime returned non-JSON response (status ${response.statusCode})`,
        toolId,
        response.statusCode >= 500,
        response.statusCode,
        response.responseBody,
      );
    }

    if (result.success) {
      return { output: result.output, retryable: false };
    }

    throw new ToolCallError(
      result.error,
      toolId,
      result.retryable,
      result.statusCode,
      response.responseBody,
    );
  } catch (error) {
    if (error instanceof ToolCallError) throw error;

    if (error instanceof HttpClientError) {
      throw new ToolRuntimeUnreachableError(
        `Tool runtime unreachable: ${error.message}`,
        { cause: error },
      );
    }

    throw new ToolRuntimeUnreachableError(
      error instanceof Error
        ? error.message
        : "Unknown error calling tool runtime",
      { cause: error },
    );
  }
}
