import { post, HttpClientError } from "@relayos/lib/http-client";
import type { StepHandler, StepHandlerResult } from "./types.js";

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

interface ToolCallConfig {
  toolId: string;
  input: Record<string, unknown>;
}

function getToolRuntimeUrl(): string {
  return process.env.TOOL_RUNTIME_URL ?? "http://localhost:3004";
}

function validateConfig(config: Record<string, unknown>): ToolCallConfig {
  const { toolId, input } = config as Partial<ToolCallConfig>;
  if (!toolId || typeof toolId !== "string") {
    throw new ToolCallError("Missing or invalid toolId in step config", "unknown");
  }
  if (!input || typeof input !== "object") {
    throw new ToolCallError("Missing or invalid input in step config", toolId);
  }
  return { toolId, input };
}

export const handleToolCall: StepHandler = async (
  step,
  context,
): Promise<StepHandlerResult> => {
  const config = validateConfig(step.config);
  const url = `${getToolRuntimeUrl()}/v1/tools/${config.toolId}/execute`;

  try {
    const response = await post(url, {
      input: config.input,
      executionId: context.executionId,
    });

    if (response.statusCode >= 400) {
      throw new ToolCallError(
        `Tool execution failed with status ${response.statusCode}`,
        config.toolId,
        response.statusCode,
        response.responseBody,
      );
    }

    const output = JSON.parse(response.responseBody);
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
      error instanceof Error ? error.message : "Unknown error calling tool runtime",
      { cause: error },
    );
  }
};
