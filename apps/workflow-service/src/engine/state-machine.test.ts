import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  transitionExecution,
  transitionStep,
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
  },
  executionSteps: {
    id: "executionSteps.id",
    status: "executionSteps.status",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: (col: string, val: string) => ({ col, val }),
  and: (...conds: unknown[]) => ({ _and: conds }),
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
});
