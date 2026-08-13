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

const mockEnqueueRetry = vi.fn().mockResolvedValue(undefined);

const mockDeps: StepRunnerDeps = {
  transitionStep: vi.fn().mockResolvedValue(undefined),
  getContext: vi.fn().mockResolvedValue({
    executionId: "exec-1",
    triggerPayload: null,
    steps: [],
  }),
  updateContext: vi.fn().mockResolvedValue(undefined),
  enqueueRetry: mockEnqueueRetry,
};

function makeRows(stepIds: string[], attempt = 1): ExecutionStepRow[] {
  return stepIds.map((id, i) => ({
    id: `row-${i}`,
    executionId: "exec-1",
    stepId: id,
    stepType: "DELAY",
    status: "PENDING",
    attempt,
  }));
}

beforeEach(async () => {
  vi.clearAllMocks();
  const mod = await import("./handlers/index.js");
  mockHandlers = (mod as unknown as { __mockHandlers: typeof mockHandlers }).__mockHandlers;
  clearHandlers();
});

describe("runSteps — success paths", () => {
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

    const result = await runSteps("exec-1", "wf-1", "proj-1", definition, makeRows(["s1", "s2", "s3"]), mockDeps);

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
      "exec-1", "wf-1", "proj-1",
      definition,
      makeRows(["cond", "step-a", "step-b"]),
      mockDeps,
    );

    expect(result.success).toBe(true);
    expect(result.completedSteps).toEqual(["cond", "step-b"]);
  });

  it("completes a single-step workflow", async () => {
    setHandler("DELAY", async () => ({ output: { ok: true } }));

    const definition: WorkflowDefinition = {
      initialStepId: "only",
      steps: [{ id: "only", type: "DELAY", name: "Solo", config: {} }],
    };

    const result = await runSteps("exec-1", "wf-1", "proj-1", definition, makeRows(["only"]), mockDeps);

    expect(result.success).toBe(true);
    expect(result.completedSteps).toEqual(["only"]);
  });

  it("calls updateContext with correct step output after each step", async () => {
    setHandler("DELAY", async () => ({ output: { value: 42 } }));

    const definition: WorkflowDefinition = {
      initialStepId: "s1",
      steps: [{ id: "s1", type: "DELAY", name: "D1", config: {} }],
    };

    await runSteps("exec-1", "wf-1", "proj-1", definition, makeRows(["s1"]), mockDeps);

    expect(mockDeps.updateContext).toHaveBeenCalledWith(
      "exec-1",
      expect.objectContaining({
        stepId: "s1",
        output: { value: 42 },
      }),
    );
  });

  it("pauses execution when a handler returns pause: true", async () => {
    setHandler("DELAY", async () => ({ output: { ok: true } }));
    setHandler("APPROVAL", async () => ({ output: { pending: true }, pause: true }));

    const definition: WorkflowDefinition = {
      initialStepId: "s1",
      steps: [
        { id: "s1", type: "DELAY", name: "D1", config: {}, onSuccess: "s2" },
        { id: "s2", type: "APPROVAL", name: "Approve", config: {}, onSuccess: "s3" },
        { id: "s3", type: "DELAY", name: "D3", config: {} },
      ],
    };

    const result = await runSteps(
      "exec-1", "wf-1", "proj-1",
      definition,
      makeRows(["s1", "s2", "s3"]),
      mockDeps,
    );

    expect(result.success).toBe(false);
    expect(result.pausedAtStepId).toBe("s2");
    expect(result.completedSteps).toEqual(["s1"]);

    expect(mockDeps.transitionStep).toHaveBeenCalledWith(
      "row-0", "RUNNING", "COMPLETED", expect.any(Object),
    );
    expect(mockDeps.transitionStep).toHaveBeenCalledWith(
      "row-1", "RUNNING", "WAITING_APPROVAL",
    );
    expect(mockDeps.transitionStep).not.toHaveBeenCalledWith(
      "row-2", expect.anything(), expect.anything(),
    );
  });
});

describe("runSteps — failure branch: retry", () => {
  it("enqueues retry and returns retryEnqueued=true when attempt < maxAttempts", async () => {
    setHandler("DELAY", async () => { throw new Error("tool failed"); });

    const definition: WorkflowDefinition = {
      initialStepId: "s1",
      steps: [{ id: "s1", type: "DELAY", name: "D1", config: {}, maxAttempts: 3 }],
    };

    const result = await runSteps(
      "exec-1", "wf-1", "proj-1",
      definition,
      makeRows(["s1"], 1),
      mockDeps,
    );

    expect(result.success).toBe(false);
    expect(result.retryEnqueued).toBe(true);
    expect(mockEnqueueRetry).toHaveBeenCalledWith(
      expect.objectContaining({ executionId: "exec-1", stepId: "s1", attempt: 2 }),
      2000,
    );
  });

  it("uses exponential backoff: attempt 2 → 4000ms delay", async () => {
    setHandler("DELAY", async () => { throw new Error("boom"); });

    const definition: WorkflowDefinition = {
      initialStepId: "s1",
      steps: [{ id: "s1", type: "DELAY", name: "D1", config: {}, maxAttempts: 5 }],
    };

    await runSteps(
      "exec-1", "wf-1", "proj-1",
      definition,
      makeRows(["s1"], 2),
      mockDeps,
    );

    expect(mockEnqueueRetry).toHaveBeenCalledWith(
      expect.objectContaining({ attempt: 3 }),
      4000,
    );
  });
});

describe("runSteps — failure branch: skip", () => {
  it("skips the step and continues to next step when onError=SKIP and exhausted", async () => {
    let callCount = 0;
    setHandler("DELAY", async () => {
      callCount++;
      if (callCount === 1) throw new Error("flaky");
      return { output: { ok: true } };
    });

    const definition: WorkflowDefinition = {
      initialStepId: "s1",
      steps: [
        { id: "s1", type: "DELAY", name: "D1", config: {}, maxAttempts: 1, onError: "SKIP", onSuccess: "s2" },
        { id: "s2", type: "DELAY", name: "D2", config: {} },
      ],
    };

    const result = await runSteps(
      "exec-1", "wf-1", "proj-1",
      definition,
      makeRows(["s1", "s2"], 1),
      mockDeps,
    );

    expect(result.success).toBe(true);
    expect(result.completedSteps).toEqual(["s2"]);
    expect(mockEnqueueRetry).not.toHaveBeenCalled();
    expect(mockDeps.transitionStep).toHaveBeenCalledWith(
      "row-0", "FAILED", "SKIPPED",
    );
  });

  it("succeeds with no further steps after a skip on the last step", async () => {
    setHandler("DELAY", async () => { throw new Error("boom"); });

    const definition: WorkflowDefinition = {
      initialStepId: "only",
      steps: [{ id: "only", type: "DELAY", name: "Solo", config: {}, maxAttempts: 1, onError: "SKIP" }],
    };

    const result = await runSteps(
      "exec-1", "wf-1", "proj-1",
      definition,
      makeRows(["only"], 1),
      mockDeps,
    );

    expect(result.success).toBe(true);
    expect(result.completedSteps).toEqual([]);
  });
});

describe("runSteps — failure branch: fail", () => {
  it("returns failure when onError=FAIL and attempts exhausted", async () => {
    setHandler("DELAY", async () => { throw new Error("fatal"); });

    const definition: WorkflowDefinition = {
      initialStepId: "s1",
      steps: [{ id: "s1", type: "DELAY", name: "D1", config: {}, maxAttempts: 1, onError: "FAIL" }],
    };

    const result = await runSteps(
      "exec-1", "wf-1", "proj-1",
      definition,
      makeRows(["s1"], 1),
      mockDeps,
    );

    expect(result.success).toBe(false);
    expect(result.failedStepId).toBe("s1");
    expect(result.error).toBe("fatal");
    expect(result.retryEnqueued).toBeUndefined();
    expect(mockEnqueueRetry).not.toHaveBeenCalled();
  });

  it("defaults to fail when no maxAttempts or onError specified", async () => {
    setHandler("DELAY", async () => { throw new Error("boom"); });

    const definition: WorkflowDefinition = {
      initialStepId: "s1",
      steps: [{ id: "s1", type: "DELAY", name: "D1", config: {} }],
    };

    const result = await runSteps(
      "exec-1", "wf-1", "proj-1",
      definition,
      makeRows(["s1"], 1),
      mockDeps,
    );

    expect(result.success).toBe(false);
    expect(result.failedStepId).toBe("s1");
  });
});

describe("runSteps — error paths", () => {
  it("returns failure for unknown step type", async () => {
    const definition: WorkflowDefinition = {
      initialStepId: "s1",
      steps: [{ id: "s1", type: "DELAY", name: "Unknown", config: {} }],
    };

    // No handler registered for DELAY in this test (clearHandlers removes all)
    const result = await runSteps("exec-1", "wf-1", "proj-1", definition, makeRows(["s1"]), mockDeps);

    expect(result.success).toBe(false);
    expect(result.error).toContain("No handler for step type");
  });
});

describe("runSteps — startFromStepId", () => {
  it("skips steps before startFromStepId and runs from there", async () => {
    setHandler("DELAY", async () => ({ output: { ok: true } }));

    const definition: WorkflowDefinition = {
      initialStepId: "s1",
      steps: [
        { id: "s1", type: "DELAY", name: "D1", config: {}, onSuccess: "s2" },
        { id: "s2", type: "DELAY", name: "D2", config: {}, onSuccess: "s3" },
        { id: "s3", type: "DELAY", name: "D3", config: {} },
      ],
    };

    const result = await runSteps(
      "exec-1", "wf-1", "proj-1",
      definition,
      makeRows(["s1", "s2", "s3"]),
      mockDeps,
      { startFromStepId: "s2" },
    );

    expect(result.success).toBe(true);
    expect(result.completedSteps).toEqual(["s2", "s3"]);
    expect(mockDeps.transitionStep).toHaveBeenCalledTimes(4);
  });
});
