import { tool, type ToolSet } from "ai";
import { z } from "zod";
import type { PlanRequest } from "../schemas/plan.js";

type AvailableTool = PlanRequest["availableTools"][number];

export function formatTools(availableTools: AvailableTool[]): ToolSet {
  const tools: ToolSet = {};

  for (const t of availableTools) {
    const schemaDescription = JSON.stringify(t.inputSchema);

    tools[t.name] = tool({
      description: `${t.description}\n\nInput JSON Schema: ${schemaDescription}`,
      inputSchema: z.object({}).passthrough(),
    }) as ToolSet[string];
  }

  return tools;
}
