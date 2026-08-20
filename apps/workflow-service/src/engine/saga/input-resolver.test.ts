import { describe, it, expect } from "vitest";
import {
  resolveCompensationInput,
  CompensationInputResolutionError,
} from "./input-resolver.js";

describe("resolveCompensationInput — success paths", () => {
  it("resolves a simple top-level path", () => {
    const result = resolveCompensationInput(
      { orderId: "$.orderId" },
      { orderId: "order-123" },
    );
    expect(result).toEqual({ orderId: "order-123" });
  });

  it("resolves a nested path through output", () => {
    const result = resolveCompensationInput(
      { orderId: "$.output.orderId" },
      { output: { orderId: "order-456" } },
    );
    expect(result).toEqual({ orderId: "order-456" });
  });

  it("resolves a deeply nested path", () => {
    const result = resolveCompensationInput(
      { id: "$.output.order.details.id" },
      { output: { order: { details: { id: "deep-789" } } } },
    );
    expect(result).toEqual({ id: "deep-789" });
  });

  it("resolves multiple keys from the same output", () => {
    const result = resolveCompensationInput(
      { orderId: "$.output.orderId", customerId: "$.output.customerId" },
      { output: { orderId: "o1", customerId: "c1" } },
    );
    expect(result).toEqual({ orderId: "o1", customerId: "c1" });
  });

  it("returns an empty object for an empty mapping", () => {
    const result = resolveCompensationInput({}, { output: { orderId: "x" } });
    expect(result).toEqual({});
  });

  it("resolves a boolean value", () => {
    const result = resolveCompensationInput(
      { cancelled: "$.output.cancelled" },
      { output: { cancelled: true } },
    );
    expect(result).toEqual({ cancelled: true });
  });

  it("resolves a numeric value", () => {
    const result = resolveCompensationInput(
      { amount: "$.output.amount" },
      { output: { amount: 9900 } },
    );
    expect(result).toEqual({ amount: 9900 });
  });
});

describe("resolveCompensationInput — error paths", () => {
  it("throws when path does not start with $.", () => {
    expect(() =>
      resolveCompensationInput(
        { orderId: "output.orderId" },
        { output: { orderId: "x" } },
      ),
    ).toThrow(CompensationInputResolutionError);
    expect(() =>
      resolveCompensationInput(
        { orderId: "output.orderId" },
        { output: { orderId: "x" } },
      ),
    ).toThrow('path must start with "$."');
  });

  it("throws when a field is missing at the first segment", () => {
    expect(() =>
      resolveCompensationInput(
        { orderId: "$.output.orderId" },
        { result: { orderId: "x" } },
      ),
    ).toThrow(CompensationInputResolutionError);
  });

  it("throws when a field is missing mid-path", () => {
    expect(() =>
      resolveCompensationInput(
        { id: "$.output.order.id" },
        { output: { otherField: "x" } },
      ),
    ).toThrow(CompensationInputResolutionError);
  });

  it("throws when stepOutput is null", () => {
    expect(() =>
      resolveCompensationInput({ orderId: "$.orderId" }, null),
    ).toThrow(CompensationInputResolutionError);
  });

  it("throws when stepOutput is undefined", () => {
    expect(() =>
      resolveCompensationInput({ orderId: "$.orderId" }, undefined),
    ).toThrow(CompensationInputResolutionError);
  });

  it("throws a typed CompensationInputResolutionError with path details", () => {
    let caught: unknown;
    try {
      resolveCompensationInput(
        { orderId: "$.output.missing" },
        { output: {} },
      );
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(CompensationInputResolutionError);
    const err = caught as CompensationInputResolutionError;
    expect(err.path).toBe("$.output.missing");
  });

  it("throws when intermediate node is an array, not an object", () => {
    expect(() =>
      resolveCompensationInput(
        { id: "$.output.items.id" },
        { output: { items: [{ id: "x" }] } },
      ),
    ).toThrow(CompensationInputResolutionError);
  });
});
