import { describe, it, expect } from "vitest";
import { handleTransform } from "./transform.js";
import type { WorkflowStep } from "@relayos/types";
import type { ExecutionContext } from "@relayos/types";

function makeStep(mapping: Record<string, unknown>): WorkflowStep {
  return {
    id: "transform-1",
    type: "TRANSFORM",
    name: "Transform step",
    config: { mapping },
  };
}

const baseContext: ExecutionContext = {
  executionId: "exec-1",
  triggerPayload: {
    userEmail: "alice@example.com",
    shouldSendWelcomeEmail: true,
    count: 42,
  },
  steps: [
    {
      stepId: "step-1",
      output: { status: "completed", result: "ok" },
      completedAt: "2026-01-01T00:00:00Z",
    },
  ],
};

describe("handleTransform", () => {
  it("passes static string values through unchanged", async () => {
    const step = makeStep({ label: "hello world" });

    const result = await handleTransform(step, baseContext);

    expect((result.output as Record<string, unknown>).label).toBe("hello world");
  });

  it("passes static non-string values through unchanged", async () => {
    const step = makeStep({ count: 99, flag: false });

    const result = await handleTransform(step, baseContext);
    const output = result.output as Record<string, unknown>;

    expect(output.count).toBe(99);
    expect(output.flag).toBe(false);
  });

  it("resolves {{payload.field}} to the trigger payload value", async () => {
    const step = makeStep({ email: "{{payload.userEmail}}" });

    const result = await handleTransform(step, baseContext);

    expect((result.output as Record<string, unknown>).email).toBe("alice@example.com");
  });

  it("preserves the original type when a template is the entire value", async () => {
    const step = makeStep({ welcomed: "{{payload.shouldSendWelcomeEmail}}" });

    const result = await handleTransform(step, baseContext);

    expect((result.output as Record<string, unknown>).welcomed).toBe(true);
  });

  it("interpolates {{payload.x}} inside a larger string", async () => {
    const step = makeStep({
      message: "Processing started for {{payload.userEmail}}",
    });

    const result = await handleTransform(step, baseContext);

    expect((result.output as Record<string, unknown>).message).toBe(
      "Processing started for alice@example.com",
    );
  });

  it("resolves {{steps.stepId.field}} from a prior step's output", async () => {
    const step = makeStep({ prevStatus: "{{steps.step-1.status}}" });

    const result = await handleTransform(step, baseContext);

    expect((result.output as Record<string, unknown>).prevStatus).toBe("completed");
  });

  it("resolves multiple templates in the same mapping", async () => {
    const step = makeStep({
      email: "{{payload.userEmail}}",
      status: "{{steps.step-1.status}}",
      static: "fixed",
    });

    const result = await handleTransform(step, baseContext);
    const output = result.output as Record<string, unknown>;

    expect(output.email).toBe("alice@example.com");
    expect(output.status).toBe("completed");
    expect(output.static).toBe("fixed");
  });

  it("renders empty string for an unresolvable payload key", async () => {
    const step = makeStep({ x: "value: {{payload.missing}}" });

    const result = await handleTransform(step, baseContext);

    expect((result.output as Record<string, unknown>).x).toBe("value: ");
  });

  it("returns undefined for an unknown step reference (single-template preserves type)", async () => {
    const step = makeStep({ x: "{{steps.nonexistent.field}}" });

    const result = await handleTransform(step, baseContext);

    expect((result.output as Record<string, unknown>).x).toBeUndefined();
  });

  it("returns undefined when triggerPayload is null (single-template preserves type)", async () => {
    const ctx: ExecutionContext = { ...baseContext, triggerPayload: null };
    const step = makeStep({ x: "{{payload.userEmail}}" });

    const result = await handleTransform(step, ctx);

    expect((result.output as Record<string, unknown>).x).toBeUndefined();
  });

  it("throws when mapping is missing from config", async () => {
    const step: WorkflowStep = {
      id: "t-1",
      type: "TRANSFORM",
      name: "Bad step",
      config: {},
    };

    await expect(handleTransform(step, baseContext)).rejects.toThrow(
      "TRANSFORM step requires a mapping object in config",
    );
  });

  it("returns no nextStepId (routing handled by step-runner)", async () => {
    const step = makeStep({ x: "y" });

    const result = await handleTransform(step, baseContext);

    expect(result.nextStepId).toBeUndefined();
  });
});
