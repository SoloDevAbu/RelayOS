import { post, HttpClientError } from "@relayos/lib/http-client";

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface IterationEntry {
  action: string;
  tool?: string;
  input?: Record<string, unknown>;
  result?: unknown;
  reasoning?: string;
  decision?: string;
}

export interface AgentPlanRequest {
  goal: string;
  context: Record<string, unknown>;
  availableTools: ToolDefinition[];
  memories: { content: string; similarity: number }[];
  iterationHistory: IterationEntry[];
}

export type AgentPlanResponse =
  | {
      action: "tool_call";
      tool: string;
      input: Record<string, unknown>;
      reasoning: string;
    }
  | { action: "complete"; summary: string; reasoning: string }
  | { action: "request_approval"; message: string; reasoning: string };

export class AgentServiceError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "AgentServiceError";
  }
}

export class AgentServiceUnreachableError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "AgentServiceUnreachableError";
  }
}

function getAgentServiceUrl(): string {
  return process.env.AGENT_SERVICE_URL ?? "http://localhost:3004";
}

const AGENT_CALL_TIMEOUT_MS = 60_000;

export async function callAgentPlan(
  request: AgentPlanRequest,
): Promise<AgentPlanResponse> {
  const url = `${getAgentServiceUrl()}/internal/plan`;

  try {
    const response = await post(url, request, {}, AGENT_CALL_TIMEOUT_MS);

    if (response.statusCode >= 400) {
      throw new AgentServiceError(
        `Agent service returned status ${response.statusCode}`,
        response.statusCode,
      );
    }

    return JSON.parse(response.responseBody) as AgentPlanResponse;
  } catch (error) {
    if (error instanceof AgentServiceError) {
      throw error;
    }

    if (error instanceof HttpClientError) {
      throw new AgentServiceUnreachableError(
        `Agent service unreachable: ${error.message}`,
        { cause: error },
      );
    }

    throw new AgentServiceUnreachableError(
      error instanceof Error
        ? error.message
        : "Unknown error calling agent service",
      { cause: error },
    );
  }
}
