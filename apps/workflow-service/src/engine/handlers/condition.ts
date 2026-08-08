import type { StepHandler, StepHandlerResult } from "./types.js";

interface ConditionConfig {
  field: string;
  operator: "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "in" | "exists";
  value?: unknown;
  onTrue: string;
  onFalse: string;
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

export const handleCondition: StepHandler = async (
  step,
  context,
): Promise<StepHandlerResult> => {
  const config = step.config as ConditionConfig;

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
