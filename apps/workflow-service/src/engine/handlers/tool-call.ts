import type { StepHandler, StepHandlerResult } from "./types.js";
import {
  callTool,
  ToolCallError,
  ToolRuntimeUnreachableError,
} from "./call-tool.js";

export { ToolCallError, ToolRuntimeUnreachableError };

interface ToolCallConfig {
  toolId: string;
  input: Record<string, unknown>;
}

function validateConfig(config: Record<string, unknown>): ToolCallConfig {
  const { toolId, input } = config as Partial<ToolCallConfig>;
  if (!toolId || typeof toolId !== "string") {
    throw new ToolCallError(
      "Missing or invalid toolId in step config",
      "unknown",
    );
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
  const result = await callTool(config.toolId, config.input, context.executionId);
  return { output: result.output };
};
