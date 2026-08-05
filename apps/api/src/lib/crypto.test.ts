import { describe, it, expect } from "vitest";
import { sha256 } from "./crypto";

describe("crypto", () => {
  describe("sha256", () => {
    it("should return different hashes for different inputs", () => {
      const hash1 = sha256("input-1");
      const hash2 = sha256("input-2");

      expect(hash1).not.toBe(hash2);
    });
  });
});
