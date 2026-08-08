import { describe, it, expect, vi, beforeEach } from "vitest";
import { runSteps, type StepRunnerDeps, type ExecutionStepRow } from "./step-runner.js";
import type { WorkflowDefinition } from "../types/workflow-definition.js";

vi.mock("./handlers/index.js", () => {
  const mockHandlers: Record<string, (...args: unknown[]) => Promise<unknown>> = {};
  return {
    stepHandlers: new Proxy(mockHandlers, {
      get(target, prop) {
        return target[prop as string];
      },
    }),
    __mockHandlers: mockHandlers,
  };
});

let mockHandlers: Record<string, (...args: unknown[]) => Promise<unknown>>;

function setHandler(type: string, fn: (...args: unknown[]) => Promise<unknown>) {
  mockHandlers[type] = fn;
}

function clearHandlers() {
  for (const key of Object.keys(mockHandlers)) {
    delete mockHandlers[key];
  }
}

const mockDeps: StepRunnerDeps = {
  transitionStep: vi.fn().mockResolvedValue(undefined),
  getContext: vi.fn().mockResolvedValue({
    executionId: "exec-1",
    triggerPayload: null,
    steps: [],
  }),
  updateContext: vi.fn().mockResolvedValue(undefined),
};

function makeRows(stepIds: string[]): ExecutionStepRow[] {
  return stepIds.map((id, i) => ({
    id: `row-${i}`,
    executionId: "exec-1",
    stepId: id,
    stepType: "DELAY",
    status: "PENDING",
  }));
}

beforeEach(async () => {
  vi.clearAllMocks();
  const mod = await import("./handlers/index.js");
  mockHandlers = (mod as unknown as { __mockHandlers: typeof mockHandlers }).__mockHandlers;
  clearHandlers();
});

describe("runSteps", () => {
  it("runs a 3-step linear workflow to completion", async () => {
    setHandler("DELAY", async () => ({ output: { delayed: true } }));

    const definition: WorkflowDefinition = {
      initialStepId: "s1",
      steps: [
        { id: "s1", type: "DELAY", name: "Delay 1", config: {}, onSuccess: "s2" },
        { id: "s2", type: "DELAY", name: "Delay 2", config: {}, onSuccess: "s3" },
        { id: "s3", type: "DELAY", name: "Delay 3", config: {} },
      ],
    };

    const result = await runSteps("exec-1", definition, makeRows(["s1", "s2", "s3"]), mockDeps);

    expect(result.success).toBe(true);
    expect(result.completedSteps).toEqual(["s1", "s2", "s3"]);
    expect(mockDeps.transitionStep).toHaveBeenCalledTimes(6);
    expect(mockDeps.updateContext).toHaveBeenCalledTimes(3);
  });

  it("follows condition branch via nextStepId", async () => {
    setHandler("CONDITION", async () => ({
      output: { conditionMet: true },
      nextStepId: "step-b",
    }));
    setHandler("DELAY", async () => ({ output: { delayed: true } }));

    const definition: WorkflowDefinition = {
      initialStepId: "cond",
      steps: [
        { id: "cond", type: "CONDITION", name: "Branch", config: {} },
        { id: "step-a", type: "DELAY", name: "A", config: {} },
        { id: "step-b", type: "DELAY", name: "B", config: {} },
      ],
    };

    const result = await runSteps(
      "exec-1",
      definition,
      makeRows(["cond", "step-a", "step-b"]),
      mockDeps,
    );

    expect(result.success).toBe(true);
    expect(result.completedSteps).toEqual(["cond", "step-b"]);
  });

  it("stops on first step failure", async () => {
    let callCount = 0;
    setHandler("DELAY", async () => {
      callCount++;
      if (callCount === 2) throw new Error("boom");
      return { output: { delayed: true } };
    });

    const definition: WorkflowDefinition = {
      initialStepId: "s1",
      steps: [
        { id: "s1", type: "DELAY", name: "D1", config: {}, onSuccess: "s2" },
        { id: "s2", type: "DELAY", name: "D2", config: {}, onSuccess: "s3" },
        { id: "s3", type: "DELAY", name: "D3", config: {} },
      ],
    };

    const result = await runSteps("exec-1", definition, makeRows(["s1", "s2", "s3"]), mockDeps);

    expect(result.success).toBe(false);
    expect(result.failedStepId).toBe("s2");
    expect(result.error).toBe("boom");
    expect(result.completedSteps).toEqual(["s1"]);
  });

  it("returns failure for unknown step type", async () => {
    const definition: WorkflowDefinition = {
      initialStepId: "s1",
      steps: [
        { id: "s1", type: "AI_PLAN", name: "Plan", config: {} },
      ],
    };

    const result = await runSteps("exec-1", definition, makeRows(["s1"]), mockDeps);

    expect(result.success).toBe(false);
    expect(result.error).toContain("No handler for step type");
  });

  it("completes a single-step workflow", async () => {
    setHandler("DELAY", async () => ({ output: { ok: true } }));

    const definition: WorkflowDefinition = {
      initialStepId: "only",
      steps: [{ id: "only", type: "DELAY", name: "Solo", config: {} }],
    };

    const result = await runSteps("exec-1", definition, makeRows(["only"]), mockDeps);

    expect(result.success).toBe(true);
    expect(result.completedSteps).toEqual(["only"]);
  });

  it("calls updateContext with correct step output after each step", async () => {
    setHandler("DELAY", async () => ({ output: { value: 42 } }));

    const definition: WorkflowDefinition = {
      initialStepId: "s1",
      steps: [{ id: "s1", type: "DELAY", name: "D1", config: {} }],
    };

    await runSteps("exec-1", definition, makeRows(["s1"]), mockDeps);

    expect(mockDeps.updateContext).toHaveBeenCalledWith(
      "exec-1",
      expect.objectContaining({
        stepId: "s1",
        output: { value: 42 },
      }),
    );
  });
});
