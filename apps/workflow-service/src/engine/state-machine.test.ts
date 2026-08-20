import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  transitionExecution,
  transitionStep,
  transitionCompensationStatus,
  updateSagaStatus,
  InvalidTransitionError,
} from "./state-machine.js";

const { mockReturning, mockWhere, mockSet, mockUpdate } = vi.hoisted(() => {
  const mockReturning = vi.fn();
  const mockWhere = vi.fn(() => ({ returning: mockReturning }));
  const mockSet = vi.fn(() => ({ where: mockWhere }));
  const mockUpdate = vi.fn(() => ({ set: mockSet }));
  return { mockReturning, mockWhere, mockSet, mockUpdate };
});

vi.mock("@relayos/db/client", () => ({
  db: { update: mockUpdate },
}));

vi.mock("@relayos/db/schema", () => ({
  executions: {
    id: "executions.id",
    status: "executions.status",
    sagaStatus: "executions.sagaStatus",
    updatedAt: "executions.updatedAt",
  },
  executionSteps: {
    id: "executionSteps.id",
    status: "executionSteps.status",
    compensationStatus: "executionSteps.compensationStatus",
    compensationOutput: "executionSteps.compensationOutput",
    compensatedAt: "executionSteps.compensatedAt",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: (col: string, val: string) => ({ col, val }),
  and: (...conds: unknown[]) => ({ _and: conds }),
  isNull: (col: string) => ({ isNull: col }),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("transitionExecution", () => {
  it("transitions PENDING → RUNNING", async () => {
    mockReturning.mockResolvedValue([{ id: "exec-1" }]);

    await transitionExecution("exec-1", "PENDING", "RUNNING", {
      startedAt: new Date("2026-01-01"),
    });

    expect(mockUpdate).toHaveBeenCalled();
    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({ status: "RUNNING" }),
    );
  });

  it("transitions RUNNING → COMPLETED", async () => {
    mockReturning.mockResolvedValue([{ id: "exec-1" }]);

    await transitionExecution("exec-1", "RUNNING", "COMPLETED", {
      completedAt: new Date("2026-01-01"),
    });

    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({ status: "COMPLETED" }),
    );
  });

  it("transitions RUNNING → FAILED with error", async () => {
    mockReturning.mockResolvedValue([{ id: "exec-1" }]);

    await transitionExecution("exec-1", "RUNNING", "FAILED", {
      error: "step blew up",
      completedAt: new Date("2026-01-01"),
    });

    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({ status: "FAILED", error: "step blew up" }),
    );
  });

  it("rejects invalid transition PENDING → COMPLETED", async () => {
    await expect(
      transitionExecution("exec-1", "PENDING", "COMPLETED"),
    ).rejects.toThrow(InvalidTransitionError);
  });

  it("rejects invalid transition COMPLETED → RUNNING", async () => {
    await expect(
      transitionExecution("exec-1", "COMPLETED", "RUNNING"),
    ).rejects.toThrow(InvalidTransitionError);
  });

  it("throws on optimistic concurrency conflict (0 rows returned)", async () => {
    mockReturning.mockResolvedValue([]);

    await expect(
      transitionExecution("exec-1", "PENDING", "RUNNING"),
    ).rejects.toThrow(InvalidTransitionError);
  });

  it("includes startedAt when transitioning to RUNNING", async () => {
    mockReturning.mockResolvedValue([{ id: "exec-1" }]);
    const now = new Date("2026-06-15");

    await transitionExecution("exec-1", "PENDING", "RUNNING", {
      startedAt: now,
    });

    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({ startedAt: now }),
    );
  });

  it("transitions RUNNING → WAITING_APPROVAL", async () => {
    mockReturning.mockResolvedValue([{ id: "exec-1" }]);

    await transitionExecution("exec-1", "RUNNING", "WAITING_APPROVAL");

    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({ status: "WAITING_APPROVAL" }),
    );
  });

  it("transitions WAITING_APPROVAL → RUNNING", async () => {
    mockReturning.mockResolvedValue([{ id: "exec-1" }]);

    await transitionExecution("exec-1", "WAITING_APPROVAL", "RUNNING");

    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({ status: "RUNNING" }),
    );
  });

  it("transitions WAITING_APPROVAL → CANCELLED", async () => {
    mockReturning.mockResolvedValue([{ id: "exec-1" }]);

    await transitionExecution("exec-1", "WAITING_APPROVAL", "CANCELLED");

    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({ status: "CANCELLED" }),
    );
  });
});

describe("transitionStep", () => {
  it("transitions PENDING → RUNNING", async () => {
    mockReturning.mockResolvedValue([{ id: "step-1" }]);

    await transitionStep("step-1", "PENDING", "RUNNING", {
      startedAt: new Date("2026-01-01"),
    });

    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({ status: "RUNNING" }),
    );
  });

  it("transitions RUNNING → COMPLETED with output", async () => {
    mockReturning.mockResolvedValue([{ id: "step-1" }]);
    const output = { result: "success" };

    await transitionStep("step-1", "RUNNING", "COMPLETED", {
      output,
      completedAt: new Date("2026-01-01"),
    });

    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({ status: "COMPLETED", output }),
    );
  });

  it("transitions RUNNING → FAILED with error", async () => {
    mockReturning.mockResolvedValue([{ id: "step-1" }]);

    await transitionStep("step-1", "RUNNING", "FAILED", {
      error: "timeout",
    });

    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({ status: "FAILED", error: "timeout" }),
    );
  });

  it("transitions PENDING → SKIPPED", async () => {
    mockReturning.mockResolvedValue([{ id: "step-1" }]);

    await transitionStep("step-1", "PENDING", "SKIPPED");

    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({ status: "SKIPPED" }),
    );
  });

  it("transitions FAILED → RUNNING (retry — new attempt starting)", async () => {
    mockReturning.mockResolvedValue([{ id: "step-1" }]);

    await transitionStep("step-1", "FAILED", "RUNNING", {
      startedAt: new Date("2026-01-01"),
    });

    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({ status: "RUNNING" }),
    );
  });

  it("transitions FAILED → SKIPPED (exhausted, onError=SKIP)", async () => {
    mockReturning.mockResolvedValue([{ id: "step-1" }]);

    await transitionStep("step-1", "FAILED", "SKIPPED");

    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({ status: "SKIPPED" }),
    );
  });

  it("rejects invalid transition FAILED → COMPLETED", async () => {
    await expect(
      transitionStep("step-1", "FAILED", "COMPLETED"),
    ).rejects.toThrow(InvalidTransitionError);
  });

  it("rejects invalid transition PENDING → COMPLETED", async () => {
    await expect(
      transitionStep("step-1", "PENDING", "COMPLETED"),
    ).rejects.toThrow(InvalidTransitionError);
  });

  it("rejects invalid transition COMPLETED → RUNNING", async () => {
    await expect(
      transitionStep("step-1", "COMPLETED", "RUNNING"),
    ).rejects.toThrow(InvalidTransitionError);
  });

  it("throws on optimistic concurrency conflict (0 rows returned)", async () => {
    mockReturning.mockResolvedValue([]);

    await expect(
      transitionStep("step-1", "PENDING", "RUNNING"),
    ).rejects.toThrow(InvalidTransitionError);
  });

  it("transitions RUNNING → WAITING_APPROVAL", async () => {
    mockReturning.mockResolvedValue([{ id: "step-1" }]);

    await transitionStep("step-1", "RUNNING", "WAITING_APPROVAL");

    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({ status: "WAITING_APPROVAL" }),
    );
  });

  it("transitions WAITING_APPROVAL → COMPLETED", async () => {
    mockReturning.mockResolvedValue([{ id: "step-1" }]);

    await transitionStep("step-1", "WAITING_APPROVAL", "COMPLETED");

    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({ status: "COMPLETED" }),
    );
  });

  it("transitions WAITING_APPROVAL → CANCELLED", async () => {
    mockReturning.mockResolvedValue([{ id: "step-1" }]);

    await transitionStep("step-1", "WAITING_APPROVAL", "CANCELLED");

    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({ status: "CANCELLED" }),
    );
  });
});

describe("transitionCompensationStatus", () => {
  it("transitions null → PENDING", async () => {
    mockReturning.mockResolvedValue([{ id: "step-1" }]);

    await transitionCompensationStatus("step-1", null, "PENDING");

    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({ compensationStatus: "PENDING" }),
    );
  });

  it("transitions PENDING → RUNNING", async () => {
    mockReturning.mockResolvedValue([{ id: "step-1" }]);

    await transitionCompensationStatus("step-1", "PENDING", "RUNNING");

    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({ compensationStatus: "RUNNING" }),
    );
  });

  it("transitions RUNNING → COMPLETED with output and timestamp", async () => {
    mockReturning.mockResolvedValue([{ id: "step-1" }]);
    const now = new Date("2026-01-01");
    const output = { reversed: true };

    await transitionCompensationStatus("step-1", "RUNNING", "COMPLETED", {
      compensationOutput: output,
      compensatedAt: now,
    });

    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({
        compensationStatus: "COMPLETED",
        compensationOutput: output,
        compensatedAt: now,
      }),
    );
  });

  it("transitions RUNNING → FAILED with error output", async () => {
    mockReturning.mockResolvedValue([{ id: "step-1" }]);
    const errorOutput = { error: "tool timed out" };

    await transitionCompensationStatus("step-1", "RUNNING", "FAILED", {
      compensationOutput: errorOutput,
    });

    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({
        compensationStatus: "FAILED",
        compensationOutput: errorOutput,
      }),
    );
  });

  it("rejects null → RUNNING (must go through PENDING first)", async () => {
    await expect(
      transitionCompensationStatus("step-1", null, "RUNNING"),
    ).rejects.toThrow(InvalidTransitionError);
  });

  it("rejects PENDING → COMPLETED (must go through RUNNING)", async () => {
    await expect(
      transitionCompensationStatus("step-1", "PENDING", "COMPLETED"),
    ).rejects.toThrow(InvalidTransitionError);
  });

  it("rejects COMPLETED → RUNNING", async () => {
    await expect(
      transitionCompensationStatus("step-1", "COMPLETED", "RUNNING"),
    ).rejects.toThrow(InvalidTransitionError);
  });

  it("rejects FAILED → COMPLETED", async () => {
    await expect(
      transitionCompensationStatus("step-1", "FAILED", "COMPLETED"),
    ).rejects.toThrow(InvalidTransitionError);
  });

  it("throws on optimistic concurrency conflict (0 rows returned)", async () => {
    mockReturning.mockResolvedValue([]);

    await expect(
      transitionCompensationStatus("step-1", null, "PENDING"),
    ).rejects.toThrow(InvalidTransitionError);
  });
});

describe("updateSagaStatus", () => {
  it("sets saga_status to COMPENSATING", async () => {
    mockReturning.mockResolvedValue([]);

    await updateSagaStatus("exec-1", "COMPENSATING");

    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({ sagaStatus: "COMPENSATING" }),
    );
  });

  it("sets saga_status to COMPENSATED", async () => {
    mockReturning.mockResolvedValue([]);

    await updateSagaStatus("exec-1", "COMPENSATED");

    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({ sagaStatus: "COMPENSATED" }),
    );
  });

  it("sets saga_status to COMPENSATION_FAILED", async () => {
    mockReturning.mockResolvedValue([]);

    await updateSagaStatus("exec-1", "COMPENSATION_FAILED");

    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({ sagaStatus: "COMPENSATION_FAILED" }),
    );
  });
});
