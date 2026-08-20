import { describe, it, expect, vi, beforeEach } from "vitest";
import { runCompensation, type CompensatableStep, type CompensationRunnerDeps } from "./compensation-runner.js";
import { ToolCallError } from "../handlers/call-tool.js";

const mockCallTool = vi.fn();
const mockTransitionCompensationStatus = vi.fn();

const deps: CompensationRunnerDeps = {
  callTool: mockCallTool,
  transitionCompensationStatus: mockTransitionCompensationStatus,
};

const step: CompensatableStep = {
  stepRowId: "row-1",
  stepId: "step-cancel-order",
  compensationToolId: "tool-uncancel-order",
  compensationInput: { orderId: "order-123" },
  executionId: "exec-1",
};

beforeEach(() => {
  vi.clearAllMocks();
  mockTransitionCompensationStatus.mockResolvedValue(undefined);
});

describe("runCompensation — success", () => {
  it("transitions PENDING→RUNNING, calls tool, transitions RUNNING→COMPLETED, returns 'completed'", async () => {
    mockCallTool.mockResolvedValue({ output: { reversed: true }, retryable: false });

    const result = await runCompensation(step, deps);

    expect(result).toBe("completed");
    expect(mockTransitionCompensationStatus).toHaveBeenNthCalledWith(
      1,
      "row-1",
      "PENDING",
      "RUNNING",
    );
    expect(mockCallTool).toHaveBeenCalledWith(
      "tool-uncancel-order",
      { orderId: "order-123" },
      "exec-1",
      "step-cancel-order",
      1,
    );
    expect(mockTransitionCompensationStatus).toHaveBeenNthCalledWith(
      2,
      "row-1",
      "RUNNING",
      "COMPLETED",
      expect.objectContaining({
        compensationOutput: { reversed: true },
        compensatedAt: expect.any(Date),
      }),
    );
  });
});

describe("runCompensation — failure cases (must never throw)", () => {
  it("transitions to FAILED and returns 'failed' on ToolCallError (4xx)", async () => {
    mockCallTool.mockRejectedValue(
      new ToolCallError("Bad request", "tool-uncancel-order", false, 400),
    );

    const result = await runCompensation(step, deps);

    expect(result).toBe("failed");
    expect(mockTransitionCompensationStatus).toHaveBeenNthCalledWith(
      2,
      "row-1",
      "RUNNING",
      "FAILED",
      expect.objectContaining({
        compensationOutput: expect.objectContaining({
          error: expect.stringContaining("Bad request"),
        }),
      }),
    );
  });

  it("returns 'failed' on timeout / network error and does not throw", async () => {
    mockCallTool.mockRejectedValue(new Error("ECONNREFUSED"));

    let thrownError: unknown;
    let result: unknown;
    try {
      result = await runCompensation(step, deps);
    } catch (e) {
      thrownError = e;
    }

    expect(thrownError).toBeUndefined();
    expect(result).toBe("failed");
  });

  it("writes the error message into compensation_output on failure", async () => {
    mockCallTool.mockRejectedValue(new Error("timeout after 30s"));

    await runCompensation(step, deps);

    expect(mockTransitionCompensationStatus).toHaveBeenNthCalledWith(
      2,
      expect.anything(),
      "RUNNING",
      "FAILED",
      expect.objectContaining({
        compensationOutput: { error: "timeout after 30s" },
      }),
    );
  });

  it("still transitions to RUNNING before calling the tool, even on failure", async () => {
    mockCallTool.mockRejectedValue(new Error("boom"));

    await runCompensation(step, deps);

    expect(mockTransitionCompensationStatus).toHaveBeenNthCalledWith(
      1,
      "row-1",
      "PENDING",
      "RUNNING",
    );
  });
});
