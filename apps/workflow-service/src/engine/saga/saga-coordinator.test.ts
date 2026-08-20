import { describe, it, expect, vi, beforeEach } from "vitest";
import { runSaga, type SagaCoordinatorDeps } from "./saga-coordinator.js";
import type { CompensatableStepRow } from "../../services/execution-service.js";

vi.mock("@relayos/db/client", () => ({ db: {} }));
vi.mock("@relayos/lib/http-client", () => ({ post: vi.fn(), HttpClientError: class extends Error {} }));
vi.mock("@relayos/db/schema", () => ({
  executions: {},
  executionSteps: {},
}));
vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  and: vi.fn(),
  isNull: vi.fn(),
}));
vi.mock("../handlers/call-tool.js", () => ({
  callTool: vi.fn(),
  ToolCallError: class extends Error {},
  ToolRuntimeUnreachableError: class extends Error {},
}));
vi.mock("../state-machine.js", () => ({
  transitionCompensationStatus: vi.fn().mockResolvedValue(undefined),
  updateSagaStatus: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../../services/execution-service.js", () => ({
  getCompensatableSteps: vi.fn(),
}));

vi.mock("@relayos/lib/logger", () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

const mockGetCompensatableSteps = vi.fn<() => Promise<CompensatableStepRow[]>>();
const mockUpdateSagaStatus = vi.fn();
const mockRunCompensation = vi.fn<(...args: any[]) => Promise<"completed" | "failed">>();

const deps: SagaCoordinatorDeps = {
  getCompensatableSteps: mockGetCompensatableSteps,
  updateSagaStatus: mockUpdateSagaStatus,
  runCompensation: mockRunCompensation,
};

function makeStep(overrides: Partial<CompensatableStepRow> = {}): CompensatableStepRow {
  return {
    stepRowId: "row-1",
    stepId: "step-1",
    compensationToolId: "tool-undo-1",
    compensationInput: { orderId: "order-123" },
    stepIndex: 0,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockUpdateSagaStatus.mockResolvedValue(undefined);
});

describe("runSaga — all succeed", () => {
  it("returns 'compensated' when all compensations succeed", async () => {
    mockGetCompensatableSteps.mockResolvedValue([
      makeStep({ stepId: "step-2", stepIndex: 1 }),
      makeStep({ stepId: "step-1", stepIndex: 0 }),
    ]);
    mockRunCompensation.mockResolvedValue("completed");

    const result = await runSaga("exec-1", deps);

    expect(result).toBe("compensated");
    expect(mockRunCompensation).toHaveBeenCalledTimes(2);
  });

  it("calls updateSagaStatus with COMPENSATING before running compensations", async () => {
    mockGetCompensatableSteps.mockResolvedValue([makeStep()]);
    mockRunCompensation.mockResolvedValue("completed");

    const callOrder: string[] = [];
    mockUpdateSagaStatus.mockImplementation(() => { callOrder.push("updateSagaStatus"); return Promise.resolve(); });
    mockRunCompensation.mockImplementation(() => { callOrder.push("runCompensation"); return Promise.resolve("completed"); });

    await runSaga("exec-1", deps);

    expect(callOrder[0]).toBe("updateSagaStatus");
    expect(callOrder[1]).toBe("runCompensation");
  });

  it("returns 'compensated' when there are no compensatable steps (vacuous success)", async () => {
    mockGetCompensatableSteps.mockResolvedValue([]);

    const result = await runSaga("exec-1", deps);

    expect(result).toBe("compensated");
    expect(mockRunCompensation).not.toHaveBeenCalled();
  });
});

describe("runSaga — partial or full failure", () => {
  it("returns 'compensation_failed' when any compensation fails", async () => {
    mockGetCompensatableSteps.mockResolvedValue([
      makeStep({ stepId: "step-2", stepIndex: 1 }),
      makeStep({ stepId: "step-1", stepIndex: 0 }),
    ]);
    mockRunCompensation
      .mockResolvedValueOnce("failed")
      .mockResolvedValueOnce("completed");

    const result = await runSaga("exec-1", deps);

    expect(result).toBe("compensation_failed");
  });

  it("calls all steps even when the first one fails", async () => {
    mockGetCompensatableSteps.mockResolvedValue([
      makeStep({ stepId: "step-3", stepIndex: 2 }),
      makeStep({ stepId: "step-2", stepIndex: 1 }),
      makeStep({ stepId: "step-1", stepIndex: 0 }),
    ]);
    mockRunCompensation
      .mockResolvedValueOnce("failed")
      .mockResolvedValueOnce("completed")
      .mockResolvedValueOnce("completed");

    await runSaga("exec-1", deps);

    expect(mockRunCompensation).toHaveBeenCalledTimes(3);
  });

  it("calls all steps when all fail", async () => {
    mockGetCompensatableSteps.mockResolvedValue([
      makeStep({ stepId: "step-2", stepIndex: 1 }),
      makeStep({ stepId: "step-1", stepIndex: 0 }),
    ]);
    mockRunCompensation.mockResolvedValue("failed");

    const result = await runSaga("exec-1", deps);

    expect(result).toBe("compensation_failed");
    expect(mockRunCompensation).toHaveBeenCalledTimes(2);
  });
});

describe("runSaga — call order", () => {
  it("calls compensations in the order returned by getCompensatableSteps (already reversed by service)", async () => {
    const callOrder: string[] = [];
    mockGetCompensatableSteps.mockResolvedValue([
      makeStep({ stepId: "step-2", stepIndex: 1 }),
      makeStep({ stepId: "step-1", stepIndex: 0 }),
    ]);
    mockRunCompensation.mockImplementation(async (step) => {
      callOrder.push(step.stepId);
      return "completed";
    });

    await runSaga("exec-1", deps);

    expect(callOrder).toEqual(["step-2", "step-1"]);
  });
});
