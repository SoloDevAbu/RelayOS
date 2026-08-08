import type { StepHandler, StepHandlerResult } from "./types.js";
import type { ExecutionContext } from "../../types/execution-context.js";

const TEMPLATE_RE = /\{\{([^}]+)\}\}/g;

function resolveTemplate(template: string, context: ExecutionContext): unknown {
  const singleMatch = template.match(/^\{\{([^}]+)\}\}$/);
  if (singleMatch) {
    return resolvePath(singleMatch[1]!.trim(), context);
  }

  return template.replace(TEMPLATE_RE, (_, path: string) => {
    const value = resolvePath(path.trim(), context);
    return value === undefined || value === null ? "" : String(value);
  });
}

function resolvePath(path: string, context: ExecutionContext): unknown {
  const [root, ...rest] = path.split(".");

  if (root === "payload") {
    return getNestedValue(context.triggerPayload, rest.join("."));
  }

  if (root === "steps") {
    const [stepId, ...stepRest] = rest;
    const stepOutput = context.steps.find((s) => s.stepId === stepId);
    if (!stepOutput) return undefined;
    return getNestedValue(stepOutput.output, stepRest.join("."));
  }

  return undefined;
}

function getNestedValue(obj: unknown, path: string): unknown {
  if (!path) return obj;
  const segments = path.split(".");
  let current: unknown = obj;
  for (const segment of segments) {
    if (current === null || current === undefined) return undefined;
    if (typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

function resolveMapping(
  mapping: Record<string, unknown>,
  context: ExecutionContext,
): Record<string, unknown> {
  const resolved: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(mapping)) {
    resolved[key] =
      typeof value === "string" ? resolveTemplate(value, context) : value;
  }
  return resolved;
}

export const handleTransform: StepHandler = async (
  step,
  context,
): Promise<StepHandlerResult> => {
  const mapping = step.config.mapping as Record<string, unknown> | undefined;

  if (!mapping || typeof mapping !== "object") {
    throw new Error("TRANSFORM step requires a mapping object in config");
  }

  const output = resolveMapping(mapping, context);

  return { output };
};
