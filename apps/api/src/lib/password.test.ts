import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword } from "./password";

describe("password", () => {
  describe("hashPassword and verifyPassword", () => {
    it("should hash a password and successfully verify it", async () => {
      const plainText = "super-secret-password";
      
      const hashedPassword = await hashPassword(plainText);
      expect(hashedPassword).toBeDefined();
      expect(hashedPassword).not.toBe(plainText);
      
      const isValid = await verifyPassword(hashedPassword, plainText);
      expect(isValid).toBe(true);
    });

    it("should fail verification for an incorrect password", async () => {
      const plainText = "super-secret-password";
      
      const hashedPassword = await hashPassword(plainText);
      
      const isValid = await verifyPassword(hashedPassword, "wrong-password");
      expect(isValid).toBe(false);
    });

    it("should generate different hashes for the same password due to salting", async () => {
      const plainText = "super-secret-password";
      
      const hash1 = await hashPassword(plainText);
      const hash2 = await hashPassword(plainText);
      
      expect(hash1).not.toBe(hash2);
      
      // Both should still verify correctly
      expect(await verifyPassword(hash1, plainText)).toBe(true);
      expect(await verifyPassword(hash2, plainText)).toBe(true);
    });
  });
});
