export interface ToolInput {
  [key: string]: unknown;
}

export interface ToolResult {
  output: unknown;
}

export type ToolExecutor = (
  input: ToolInput,
  executionId: string,
) => Promise<ToolResult>;

const registry = new Map<string, ToolExecutor>();

export function registerTool(toolId: string, executor: ToolExecutor): void {
  registry.set(toolId, executor);
}

export function getTool(toolId: string): ToolExecutor | undefined {
  return registry.get(toolId);
}
