import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { handleDelay } from "./delay.js";
import type { WorkflowStep } from "../../types/workflow-definition.js";
import type { ExecutionContext } from "../../types/execution-context.js";

const baseContext: ExecutionContext = {
  executionId: "exec-1",
  triggerPayload: null,
  steps: [],
};

function makeDelayStep(durationMs: unknown): WorkflowStep {
  return {
    id: "delay-1",
    type: "DELAY",
    name: "Wait",
    config: { durationMs },
  };
}

describe("handleDelay", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("waits for the specified duration", async () => {
    const promise = handleDelay(makeDelayStep(1000), baseContext);

    await vi.advanceTimersByTimeAsync(1000);
    const result = await promise;

    expect(result.output).toEqual({ delayed: true, durationMs: 1000 });
  });

  it("throws on negative duration", async () => {
    await expect(handleDelay(makeDelayStep(-100), baseContext)).rejects.toThrow(
      "Invalid delay duration",
    );
  });

  it("throws on non-number duration", async () => {
    await expect(handleDelay(makeDelayStep("abc"), baseContext)).rejects.toThrow(
      "Invalid delay duration",
    );
  });

  it("handles zero duration delay", async () => {
    const promise = handleDelay(makeDelayStep(0), baseContext);

    await vi.advanceTimersByTimeAsync(0);
    const result = await promise;

    expect(result.output).toEqual({ delayed: true, durationMs: 0 });
  });
});
