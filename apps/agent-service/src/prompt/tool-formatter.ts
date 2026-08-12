import { tool, jsonSchema, type ToolSet } from "ai";
import type { PlanRequest } from "../schemas/plan.js";

type AvailableTool = PlanRequest["availableTools"][number];

export const META_TOOL_NAMES = {
  complete: "mark_goal_complete",
  approval: "request_human_approval",
} as const;

export function formatTools(availableTools: AvailableTool[]): ToolSet {
  const tools: ToolSet = {};

  for (const t of availableTools) {
    tools[t.name] = tool({
      description: t.description,
      inputSchema: jsonSchema(
        t.inputSchema as Parameters<typeof jsonSchema>[0],
      ),
    });
  }

  tools[META_TOOL_NAMES.complete] = tool({
    description:
      "Call this when the goal is fully satisfied based on the iteration history. " +
      "Provide a summary of what was accomplished.",
    inputSchema: jsonSchema({
      type: "object" as const,
      properties: {
        summary: {
          type: "string",
          description: "A brief summary of the completed goal and its results.",
        },
      },
      required: ["summary"],
    }),
  });

  tools[META_TOOL_NAMES.approval] = tool({
    description:
      "Call this when you are uncertain, the task is ambiguous, " +
      "or a decision requires human judgment before proceeding.",
    inputSchema: jsonSchema({
      type: "object" as const,
      properties: {
        message: {
          type: "string",
          description: "Explanation of what needs human review and why.",
        },
      },
      required: ["message"],
    }),
  });

  return tools;
}
