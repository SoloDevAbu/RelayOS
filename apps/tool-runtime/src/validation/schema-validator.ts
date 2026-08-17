import Ajv, { type ValidateFunction } from "ajv";
import addFormats from "ajv-formats";

const ajv = new Ajv({ strict: false, allErrors: true });
addFormats(ajv);

export interface ValidationError {
  field: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

const schemaCache = new Map<string, ValidateFunction>();

function getValidator(
  toolId: string,
  inputSchema: Record<string, unknown>,
): ValidateFunction {
  const cached = schemaCache.get(toolId);
  if (cached) return cached;
  const validator = ajv.compile(inputSchema);
  schemaCache.set(toolId, validator);
  return validator;
}

/**
 * Validates the given input against the tool's inputSchema.
 * The validator is compiled once per toolId and cached.
 */
export function validateInput(
  toolId: string,
  inputSchema: Record<string, unknown>,
  input: unknown,
): ValidationResult {
  const validate = getValidator(toolId, inputSchema);
  const valid = validate(input) as boolean;

  if (valid) return { valid: true, errors: [] };

  const errors: ValidationError[] = (validate.errors ?? []).map((e) => ({
    field: e.instancePath || e.params?.missingProperty as string || "/",
    message: e.message ?? "validation error",
  }));

  return { valid: false, errors };
}

export function clearSchemaCache(): void {
  schemaCache.clear();
}
