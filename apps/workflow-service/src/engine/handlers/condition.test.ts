import { describe, it, expect } from "vitest";
import { handleCondition, getNestedValue } from "./condition.js";
import type { WorkflowStep } from "@relayos/types";
import type { ExecutionContext } from "@relayos/types";

function makeStep(config: Record<string, unknown>): WorkflowStep {
  return {
    id: "cond-1",
    type: "CONDITION",
    name: "Check value",
    config,
  };
}

function makeExpressionStep(
  expression: string,
  onSuccess?: string,
  onFailure?: string,
): WorkflowStep {
  return {
    id: "cond-expr",
    type: "CONDITION",
    name: "Expression check",
    config: { expression },
    onSuccess,
    onFailure,
  };
}

const baseContext: ExecutionContext = {
  executionId: "exec-1",
  projectId: "project-1",
  triggerPayload: { env: "production", shouldSendWelcomeEmail: true },
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

describe("handleCondition — structured format", () => {
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

describe("handleCondition — expression format", () => {
  it("routes to onSuccess when payload boolean is true via == true", async () => {
    const step = makeExpressionStep(
      "{{payload.shouldSendWelcomeEmail}} == true",
      "step-welcome",
      "step-skip",
    );

    const result = await handleCondition(step, baseContext);

    expect((result.output as Record<string, unknown>).conditionMet).toBe(true);
    expect(result.nextStepId).toBe("step-welcome");
  });

  it("routes to onFailure when payload boolean is false via == true", async () => {
    const ctx: ExecutionContext = {
      ...baseContext,
      triggerPayload: { shouldSendWelcomeEmail: false },
    };
    const step = makeExpressionStep(
      "{{payload.shouldSendWelcomeEmail}} == true",
      "step-welcome",
      "step-skip",
    );

    const result = await handleCondition(step, ctx);

    expect((result.output as Record<string, unknown>).conditionMet).toBe(false);
    expect(result.nextStepId).toBe("step-skip");
  });

  it("evaluates == against a string payload value", async () => {
    const step = makeExpressionStep(
      "{{payload.env}} == production",
      "step-prod",
      "step-other",
    );

    const result = await handleCondition(step, baseContext);

    expect((result.output as Record<string, unknown>).conditionMet).toBe(true);
    expect(result.nextStepId).toBe("step-prod");
  });

  it("evaluates != operator correctly", async () => {
    const step = makeExpressionStep(
      "{{payload.env}} != staging",
      "step-not-staging",
      "step-staging",
    );

    const result = await handleCondition(step, baseContext);

    expect((result.output as Record<string, unknown>).conditionMet).toBe(true);
    expect(result.nextStepId).toBe("step-not-staging");
  });

  it("resolves step output values in expression", async () => {
    const step = makeExpressionStep(
      "{{steps.step-1.status}} == ok",
      "step-ok",
      "step-fail",
    );

    const result = await handleCondition(step, baseContext);

    expect((result.output as Record<string, unknown>).conditionMet).toBe(true);
    expect(result.nextStepId).toBe("step-ok");
  });

  it("returns false for unresolved template (missing payload key)", async () => {
    const step = makeExpressionStep(
      "{{payload.nonexistent}} == true",
      "step-a",
      "step-b",
    );

    const result = await handleCondition(step, baseContext);

    expect((result.output as Record<string, unknown>).conditionMet).toBe(false);
    expect(result.nextStepId).toBe("step-b");
  });

  it("uses step.onSuccess and step.onFailure for routing (not config fields)", async () => {
    const step = makeExpressionStep(
      "{{payload.env}} == production",
      "correct-success",
      "correct-failure",
    );

    const result = await handleCondition(step, baseContext);

    expect(result.nextStepId).toBe("correct-success");
  });

  it("includes the expression in output", async () => {
    const expression = "{{payload.env}} == production";
    const step = makeExpressionStep(expression, "step-a", "step-b");

    const result = await handleCondition(step, baseContext);

    expect((result.output as Record<string, unknown>).expression).toBe(expression);
  });
});
