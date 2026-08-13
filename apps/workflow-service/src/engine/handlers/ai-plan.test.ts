import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleAiPlan, AiPlanMaxIterationsError } from "./ai-plan.js";
import type { WorkflowStep } from "../../types/workflow-definition.js";
import type { ExecutionContext } from "../../types/execution-context.js";

const { mockCallAgentPlan, mockCallTool, mockGetIterationHistory, mockUpdateIterationHistory, mockDbInsert } =
  vi.hoisted(() => ({
    mockCallAgentPlan: vi.fn(),
    mockCallTool: vi.fn(),
    mockGetIterationHistory: vi.fn().mockResolvedValue([]),
    mockUpdateIterationHistory: vi.fn().mockResolvedValue(undefined),
    mockDbInsert: vi.fn(),
  }));

vi.mock("../../services/agent-service-client.js", () => ({
  callAgentPlan: (...args: unknown[]) => mockCallAgentPlan(...args),
}));

vi.mock("./call-tool.js", () => ({
  callTool: (...args: unknown[]) => mockCallTool(...args),
}));

vi.mock("../context-manager.js", () => ({
  getIterationHistory: (...args: unknown[]) => mockGetIterationHistory(...args),
  updateIterationHistory: (...args: unknown[]) =>
    mockUpdateIterationHistory(...args),
}));

vi.mock("@relayos/db/client", () => ({
  db: {
    insert: (...args: unknown[]) => mockDbInsert(...args),
  },
}));

vi.mock("@relayos/db/schema", () => ({
  approvals: "approvals",
}));

const baseStep: WorkflowStep = {
  id: "step-ai",
  type: "AI_PLAN",
  name: "Plan Step",
  config: {
    goal: "Summarize the quarterly report",
    availableTools: [
      {
        name: "search",
        description: "Search the web",
        inputSchema: {},
      },
    ],
  },
  maxIterations: 5,
};

const baseContext: ExecutionContext = {
  executionId: "exec-1",
  triggerPayload: null,
  steps: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  mockGetIterationHistory.mockResolvedValue([]);
  mockUpdateIterationHistory.mockResolvedValue(undefined);
});

describe("handleAiPlan — complete branch", () => {
  it("returns output immediately when agent says complete on first call", async () => {
    mockCallAgentPlan.mockResolvedValue({
      action: "complete",
      summary: "Report summarized.",
      reasoning: "Done.",
    });

    const result = await handleAiPlan(baseStep, baseContext);

    expect(result.output).toEqual({
      summary: "Report summarized.",
      reasoning: "Done.",
    });
    expect(result.pause).toBeUndefined();
    expect(mockCallTool).not.toHaveBeenCalled();
  });
});

describe("handleAiPlan — tool_call branch", () => {
  it("calls tool, appends to history, calls agent again, then completes", async () => {
    mockCallAgentPlan
      .mockResolvedValueOnce({
        action: "tool_call",
        tool: "search",
        input: { query: "quarterly report" },
        reasoning: "Need to find the report.",
      })
      .mockResolvedValueOnce({
        action: "complete",
        summary: "Found and summarized.",
        reasoning: "Done.",
      });

    mockCallTool.mockResolvedValue({ output: { text: "report content" } });

    const result = await handleAiPlan(baseStep, baseContext);

    expect(mockCallAgentPlan).toHaveBeenCalledTimes(2);
    expect(mockCallTool).toHaveBeenCalledWith(
      "search",
      { query: "quarterly report" },
      "exec-1",
    );

    const secondCallArgs = mockCallAgentPlan.mock.calls[1]![0];
    expect(secondCallArgs.iterationHistory).toHaveLength(1);
    expect(secondCallArgs.iterationHistory[0].action).toBe("tool_call");
    expect(secondCallArgs.iterationHistory[0].result).toEqual({
      text: "report content",
    });

    expect(mockUpdateIterationHistory).toHaveBeenCalled();
    expect(result.output).toEqual({
      summary: "Found and summarized.",
      reasoning: "Done.",
    });
  });

  it("sends existing iterationHistory to agent on re-entry (resume case)", async () => {
    const existingHistory = [
      { action: "tool_call", tool: "search", result: { text: "old data" } },
    ];
    mockGetIterationHistory.mockResolvedValue(existingHistory);

    mockCallAgentPlan.mockResolvedValue({
      action: "complete",
      summary: "Resumed and done.",
      reasoning: "Had prior context.",
    });

    await handleAiPlan(baseStep, baseContext);

    const callArgs = mockCallAgentPlan.mock.calls[0]![0];
    expect(callArgs.iterationHistory).toEqual(existingHistory);
  });
});

describe("handleAiPlan — request_approval branch", () => {
  it("inserts approval record, persists history, and returns pause signal", async () => {
    const mockValues = vi.fn().mockResolvedValue(undefined);
    mockDbInsert.mockReturnValue({ values: mockValues });

    mockCallAgentPlan.mockResolvedValue({
      action: "request_approval",
      message: "Please approve this sensitive action.",
      reasoning: "High-risk operation detected.",
    });

    const result = await handleAiPlan(baseStep, baseContext);

    expect(result.pause).toBe(true);
    expect(result.output).toMatchObject({ awaiting: "APPROVAL" });
    expect(mockDbInsert).toHaveBeenCalledWith("approvals");
    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({
        executionId: "exec-1",
        stepId: "step-ai",
        status: "PENDING",
      }),
    );
    expect(mockUpdateIterationHistory).toHaveBeenCalledWith(
      "exec-1",
      "step-ai",
      [],
    );
  });

  it("includes approval decision in history when resuming after approval", async () => {
    const historyBeforeApproval = [
      { action: "tool_call", tool: "search", result: {} },
      { action: "request_approval", decision: "APPROVED" },
    ];
    mockGetIterationHistory.mockResolvedValue(historyBeforeApproval);

    mockCallAgentPlan.mockResolvedValue({
      action: "complete",
      summary: "Resumed after approval.",
      reasoning: "Approval received.",
    });

    await handleAiPlan(baseStep, baseContext);

    const callArgs = mockCallAgentPlan.mock.calls[0]![0];
    expect(callArgs.iterationHistory).toEqual(historyBeforeApproval);
    expect(
      callArgs.iterationHistory.some(
        (e: { action: string; decision?: string }) =>
          e.action === "request_approval" && e.decision === "APPROVED",
      ),
    ).toBe(true);
  });
});

describe("handleAiPlan — maxIterations", () => {
  it("throws AiPlanMaxIterationsError when iteration count exceeds max", async () => {
    const tightStep: WorkflowStep = {
      ...baseStep,
      maxIterations: 2,
    };

    mockCallAgentPlan.mockResolvedValue({
      action: "tool_call",
      tool: "search",
      input: { query: "q" },
      reasoning: "Keep searching.",
    });
    mockCallTool.mockResolvedValue({ output: {} });

    await expect(handleAiPlan(tightStep, baseContext)).rejects.toThrow(
      AiPlanMaxIterationsError,
    );
  });

  it("uses default maxIterations of 10 when not specified in step", async () => {
    const stepWithoutMax: WorkflowStep = {
      ...baseStep,
      maxIterations: undefined,
    };

    mockCallAgentPlan.mockResolvedValue({
      action: "tool_call",
      tool: "search",
      input: {},
      reasoning: "Searching.",
    });
    mockCallTool.mockResolvedValue({ output: {} });

    let callCount = 0;
    mockCallAgentPlan.mockImplementation(async () => {
      callCount++;
      if (callCount >= 10) {
        return { action: "complete", summary: "Done at 10.", reasoning: "" };
      }
      return {
        action: "tool_call",
        tool: "search",
        input: {},
        reasoning: "Still going.",
      };
    });

    const result = await handleAiPlan(stepWithoutMax, baseContext);
    expect(result.output).toMatchObject({ summary: "Done at 10." });
  });
});
