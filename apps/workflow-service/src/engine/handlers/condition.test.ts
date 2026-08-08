import { describe, it, expect } from "vitest";
import { handleCondition, getNestedValue } from "./condition.js";
import type { WorkflowStep } from "../../types/workflow-definition.js";
import type { ExecutionContext } from "../../types/execution-context.js";

function makeStep(config: Record<string, unknown>): WorkflowStep {
  return {
    id: "cond-1",
    type: "CONDITION",
    name: "Check value",
    config,
  };
}

const baseContext: ExecutionContext = {
  executionId: "exec-1",
  triggerPayload: { env: "production" },
  steps: [
    {
      stepId: "step-1",
      output: { status: "ok", count: 10 },
      completedAt: "2026-01-01T00:00:00Z",
    },
  ],
};

describe("getNestedValue", () => {
  it("resolves a top-level key", () => {
    expect(getNestedValue({ a: 1 }, "a")).toBe(1);
  });

  it("resolves a nested path", () => {
    expect(getNestedValue(baseContext, "steps.0.output.status")).toBe("ok");
  });

  it("returns undefined for missing path", () => {
    expect(getNestedValue(baseContext, "steps.0.output.missing")).toBeUndefined();
  });

  it("returns undefined when traversing null", () => {
    expect(getNestedValue({ a: null }, "a.b")).toBeUndefined();
  });
});

describe("handleCondition", () => {
  it("returns onTrue when eq matches", async () => {
    const step = makeStep({
      field: "steps.0.output.status",
      operator: "eq",
      value: "ok",
      onTrue: "step-a",
      onFalse: "step-b",
    });

    const result = await handleCondition(step, baseContext);

    expect(result.nextStepId).toBe("step-a");
    expect((result.output as Record<string, unknown>).conditionMet).toBe(true);
  });

  it("returns onFalse when eq does not match", async () => {
    const step = makeStep({
      field: "steps.0.output.status",
      operator: "eq",
      value: "error",
      onTrue: "step-a",
      onFalse: "step-b",
    });

    const result = await handleCondition(step, baseContext);

    expect(result.nextStepId).toBe("step-b");
    expect((result.output as Record<string, unknown>).conditionMet).toBe(false);
  });

  it("handles neq operator", async () => {
    const step = makeStep({
      field: "steps.0.output.status",
      operator: "neq",
      value: "error",
      onTrue: "step-a",
      onFalse: "step-b",
    });

    const result = await handleCondition(step, baseContext);
    expect(result.nextStepId).toBe("step-a");
  });

  it("handles gt operator", async () => {
    const step = makeStep({
      field: "steps.0.output.count",
      operator: "gt",
      value: 5,
      onTrue: "step-a",
      onFalse: "step-b",
    });

    const result = await handleCondition(step, baseContext);
    expect(result.nextStepId).toBe("step-a");
  });

  it("handles gte operator", async () => {
    const step = makeStep({
      field: "steps.0.output.count",
      operator: "gte",
      value: 10,
      onTrue: "step-a",
      onFalse: "step-b",
    });

    const result = await handleCondition(step, baseContext);
    expect(result.nextStepId).toBe("step-a");
  });

  it("handles lt operator", async () => {
    const step = makeStep({
      field: "steps.0.output.count",
      operator: "lt",
      value: 5,
      onTrue: "step-a",
      onFalse: "step-b",
    });

    const result = await handleCondition(step, baseContext);
    expect(result.nextStepId).toBe("step-b");
  });

  it("handles lte operator", async () => {
    const step = makeStep({
      field: "steps.0.output.count",
      operator: "lte",
      value: 10,
      onTrue: "step-a",
      onFalse: "step-b",
    });

    const result = await handleCondition(step, baseContext);
    expect(result.nextStepId).toBe("step-a");
  });

  it("handles in operator", async () => {
    const step = makeStep({
      field: "steps.0.output.status",
      operator: "in",
      value: ["ok", "pending"],
      onTrue: "step-a",
      onFalse: "step-b",
    });

    const result = await handleCondition(step, baseContext);
    expect(result.nextStepId).toBe("step-a");
  });

  it("handles exists operator when field exists", async () => {
    const step = makeStep({
      field: "steps.0.output.status",
      operator: "exists",
      onTrue: "step-a",
      onFalse: "step-b",
    });

    const result = await handleCondition(step, baseContext);
    expect(result.nextStepId).toBe("step-a");
  });

  it("handles exists operator when field is missing", async () => {
    const step = makeStep({
      field: "steps.0.output.nonexistent",
      operator: "exists",
      onTrue: "step-a",
      onFalse: "step-b",
    });

    const result = await handleCondition(step, baseContext);
    expect(result.nextStepId).toBe("step-b");
  });

  it("throws on missing config fields", async () => {
    const step = makeStep({ field: "x" });

    await expect(handleCondition(step, baseContext)).rejects.toThrow(
      "Condition step requires field, operator, onTrue, and onFalse",
    );
  });
});
