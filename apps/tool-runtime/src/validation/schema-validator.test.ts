import { describe, it, expect, beforeEach } from "vitest";
import {
  validateInput,
  clearSchemaCache,
} from "./schema-validator.js";

const TOOL_ID = "test-tool";

const schema = {
  type: "object",
  required: ["name", "age"],
  properties: {
    name: { type: "string" },
    age: { type: "integer", minimum: 0 },
    email: { type: "string", format: "email" },
  },
  additionalProperties: false,
};

beforeEach(() => {
  clearSchemaCache();
});

describe("validateInput", () => {
  it("passes valid input", () => {
    const result = validateInput(TOOL_ID, schema, { name: "Alice", age: 30 });
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("fails when a required field is missing", () => {
    const result = validateInput(TOOL_ID, schema, { name: "Alice" });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.message.includes("required") || e.field.includes("age"))).toBe(true);
  });

  it("fails when a field has the wrong type", () => {
    const result = validateInput(TOOL_ID, schema, { name: "Alice", age: "thirty" });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field.includes("age"))).toBe(true);
  });

  it("fails when an additional property is present", () => {
    const result = validateInput(TOOL_ID, schema, { name: "A", age: 1, extra: true });
    expect(result.valid).toBe(false);
  });

  it("fails when email format is invalid", () => {
    const result = validateInput(TOOL_ID, schema, { name: "A", age: 1, email: "not-an-email" });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field.includes("email"))).toBe(true);
  });

  it("accepts valid email format", () => {
    const result = validateInput(TOOL_ID, schema, { name: "A", age: 1, email: "a@b.com" });
    expect(result.valid).toBe(true);
  });

  it("uses a cached validator on repeated calls", () => {
    validateInput(TOOL_ID, schema, { name: "A", age: 1 });
    validateInput(TOOL_ID, schema, { name: "B", age: 2 });
    // No error = cache didn't corrupt the validator
    const result = validateInput(TOOL_ID, schema, { name: "C", age: 3 });
    expect(result.valid).toBe(true);
  });
});
