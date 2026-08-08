import type { StepHandler, StepHandlerResult } from "./types.js";
import type { ExecutionContext } from "../../types/execution-context.js";

interface StructuredConditionConfig {
  field: string;
  operator: "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "in" | "exists";
  value?: unknown;
  onTrue: string;
  onFalse: string;
}

interface ExpressionConditionConfig {
  expression: string;
}

function getNestedValue(obj: unknown, path: string): unknown {
  const segments = path.split(".");
  let current: unknown = obj;

  for (const segment of segments) {
    if (current === null || current === undefined) return undefined;
    if (typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[segment];
  }

  return current;
}

function evaluateCondition(resolved: unknown, operator: string, value: unknown): boolean {
  switch (operator) {
    case "eq":
      return resolved === value;
    case "neq":
      return resolved !== value;
    case "gt":
      return typeof resolved === "number" && typeof value === "number" && resolved > value;
    case "gte":
      return typeof resolved === "number" && typeof value === "number" && resolved >= value;
    case "lt":
      return typeof resolved === "number" && typeof value === "number" && resolved < value;
    case "lte":
      return typeof resolved === "number" && typeof value === "number" && resolved <= value;
    case "in":
      return Array.isArray(value) && value.includes(resolved);
    case "exists":
      return resolved !== undefined && resolved !== null;
    default:
      throw new Error(`Unsupported condition operator: ${operator}`);
  }
}

function resolveExpressionTemplate(expression: string, context: ExecutionContext): string {
  return expression.replace(/\{\{([^}]+)\}\}/g, (_, path: string) => {
    const value = resolveContextPath(path.trim(), context);
    return value === undefined || value === null ? "" : String(value);
  });
}

function resolveContextPath(path: string, context: ExecutionContext): unknown {
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

function evaluateExpression(expression: string, context: ExecutionContext): boolean {
  const resolved = resolveExpressionTemplate(expression, context);

  const eqMatch = resolved.match(/^(.+?)\s*==\s*(.+)$/);
  if (eqMatch) {
    return eqMatch[1]!.trim() === eqMatch[2]!.trim();
  }

  const neqMatch = resolved.match(/^(.+?)\s*!=\s*(.+)$/);
  if (neqMatch) {
    return neqMatch[1]!.trim() !== neqMatch[2]!.trim();
  }

  return resolved.trim() === "true";
}

export const handleCondition: StepHandler = async (
  step,
  context,
): Promise<StepHandlerResult> => {
  if ("expression" in step.config) {
    const { expression } = step.config as unknown as ExpressionConditionConfig;
    const conditionMet = evaluateExpression(expression, context);

    return {
      output: { conditionMet, expression },
      nextStepId: conditionMet ? step.onSuccess : step.onFailure,
    };
  }

  const config = step.config as unknown as StructuredConditionConfig;

  if (!config.field || !config.operator || !config.onTrue || !config.onFalse) {
    throw new Error("Condition step requires field, operator, onTrue, and onFalse in config");
  }

  const resolved = getNestedValue(context, config.field);
  const conditionMet = evaluateCondition(resolved, config.operator, config.value);

  return {
    output: {
      conditionMet,
      field: config.field,
      operator: config.operator,
      resolvedValue: resolved,
    },
    nextStepId: conditionMet ? config.onTrue : config.onFalse,
  };
};

export { getNestedValue };
