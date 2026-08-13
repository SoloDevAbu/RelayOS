import { post, HttpClientError } from "@relayos/lib/http-client";

export class ToolCallError extends Error {
  constructor(
    message: string,
    public readonly toolId: string,
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

export interface CallToolResult {
  output: Record<string, unknown>;
}

export function getToolRuntimeUrl(): string {
  return process.env.TOOL_RUNTIME_URL ?? "http://localhost:8080";
}

export async function callTool(
  toolId: string,
  input: Record<string, unknown>,
  executionId: string,
): Promise<CallToolResult> {
  const url = `${getToolRuntimeUrl()}/v1/tools/${toolId}/execute`;

  try {
    const response = await post(url, { input, executionId });

    if (response.statusCode >= 400) {
      throw new ToolCallError(
        `Tool execution failed with status ${response.statusCode}`,
        toolId,
        response.statusCode,
        response.responseBody,
      );
    }

    const output = JSON.parse(response.responseBody) as Record<string, unknown>;
    return { output };
  } catch (error) {
    if (error instanceof ToolCallError) {
      throw error;
    }

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
