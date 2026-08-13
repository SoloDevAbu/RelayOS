import { describe, it, expect } from "vitest";
import { formatTools, META_TOOL_NAMES } from "./tool-formatter.js";

describe("formatTools", () => {
  it("formats user provided tools correctly", () => {
    const availableTools = [
      {
        name: "my_custom_tool",
        description: "A custom tool",
        inputSchema: { type: "object", properties: { x: { type: "string" } } },
      },
    ];

    const result = formatTools(availableTools);

    expect(result).toHaveProperty("my_custom_tool");
    expect(result).toHaveProperty(META_TOOL_NAMES.complete);
    expect(result).toHaveProperty(META_TOOL_NAMES.approval);
  });

  it("adds meta tools with correct names", () => {
    const result = formatTools([]);

    expect(result).toHaveProperty("mark_goal_complete");
    expect(result).toHaveProperty("request_human_approval");
  });
});
