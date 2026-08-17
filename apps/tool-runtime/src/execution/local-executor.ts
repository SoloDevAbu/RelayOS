/**
 * LOCAL tool executor — routes invocations to in-process handler functions.
 *
 * TEST-FIXTURES ONLY. LOCAL invocation type is never assigned to tools registered
 * by real users (platform-api enforces WEBHOOK for production tools). This executor
 * exists solely to enable end-to-end testing via sayHello and flaky-test-tool without
 * a running external endpoint.
 */
import { getTool } from "../tools/registry.js";
import type { ToolExecutionResult } from "@relayos/types";

export interface LocalExecutionRequest {
  toolId: string;
  input: Record<string, unknown>;
  executionId: string;
}

export async function runLocalTool(
  req: LocalExecutionRequest,
): Promise<ToolExecutionResult> {
  const executor = getTool(req.toolId);
  if (!executor) {
    return {
      success: false,
      error: `LOCAL tool "${req.toolId}" is not registered in-process`,
      retryable: false,
      durationMs: 0,
    };
  }

  const start = Date.now();
  try {
    const result = await executor(req.input, req.executionId);
    return {
      success: true,
      output: result.output,
      durationMs: Date.now() - start,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      retryable: true,
      durationMs: Date.now() - start,
    };
  }
}
