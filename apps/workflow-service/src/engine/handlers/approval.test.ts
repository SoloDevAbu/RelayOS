import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleApproval } from "./approval.js";
import type { WorkflowStep } from "@relayos/types";
import type { ExecutionContext } from "@relayos/types";

const { mockValues, mockInsert } = vi.hoisted(() => {
  const mockValues = vi.fn();
  const mockInsert = vi.fn(() => ({ values: mockValues }));
  return { mockValues, mockInsert };
});

vi.mock("@relayos/db/client", () => ({
  db: { insert: mockInsert },
}));

vi.mock("@relayos/db/schema", () => ({
  approvals: {},
}));

describe("handleApproval", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("inserts a pending approval row and returns pause: true", async () => {
    const step = {
      id: "approval-1",
      type: "APPROVAL",
      name: "Human Review",
      config: { prompt: "Please approve this." },
    } as WorkflowStep;

    const context: ExecutionContext = {
      executionId: "exec-1",
      triggerPayload: { test: true },
      steps: [{ stepId: "s1", output: { done: true }, completedAt: new Date().toISOString() }],
    };

    const mockValues = vi.fn().mockResolvedValue(undefined);
    mockInsert.mockReturnValue({ values: mockValues } as any);

    const result = await handleApproval(step, context);

    expect(result.pause).toBe(true);
    expect(result.output).toEqual({ awaiting: "APPROVAL", stepId: "approval-1" });

    expect(mockInsert).toHaveBeenCalled();
    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({
        executionId: "exec-1",
        stepId: "approval-1",
        prompt: "Please approve this.",
        status: "PENDING",
        context: {
          stepName: "Human Review",
          triggerPayload: { test: true },
          completedSteps: ["s1"],
        },
      }),
    );
  });

  it("uses a default prompt if none is provided", async () => {
    const step = {
      id: "approval-1",
      type: "APPROVAL",
      name: "Human Review",
      config: {},
    } as WorkflowStep;

    const context: ExecutionContext = {
      executionId: "exec-1",
      triggerPayload: null,
      steps: [],
    };

    const mockValues = vi.fn().mockResolvedValue(undefined);
    mockInsert.mockReturnValue({ values: mockValues } as any);

    await handleApproval(step, context);

    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: "Manual approval required to continue execution.",
      }),
    );
  });
});
