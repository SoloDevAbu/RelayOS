import { describe, it, expect } from "vitest";
import { encrypt, decrypt } from "./encryption.js";

const MASTER_KEY = "a".repeat(64);
const WRONG_KEY = "b".repeat(64);

describe("encrypt / decrypt", () => {
  it("round-trips a plaintext string", () => {
    const plaintext = "super-secret-api-key";
    const ciphertext = encrypt(plaintext, MASTER_KEY);
    expect(decrypt(ciphertext, MASTER_KEY)).toBe(plaintext);
  });

  it("produces different ciphertexts for the same input (random IV)", () => {
    const a = encrypt("same", MASTER_KEY);
    const b = encrypt("same", MASTER_KEY);
    expect(a).not.toBe(b);
  });

  it("throws when decrypted with the wrong key", () => {
    const ciphertext = encrypt("secret", MASTER_KEY);
    expect(() => decrypt(ciphertext, WRONG_KEY)).toThrow();
  });

  it("throws on a tampered ciphertext", () => {
    const ciphertext = encrypt("secret", MASTER_KEY);
    const parts = ciphertext.split(":");
    // Flip the last character of the data segment
    parts[2] = parts[2]!.slice(0, -1) + (parts[2]!.endsWith("f") ? "0" : "f");
    expect(() => decrypt(parts.join(":"), MASTER_KEY)).toThrow();
  });

  it("throws when the key is not 64 hex characters", () => {
    expect(() => encrypt("x", "tooshort")).toThrow(/64 hex characters/);
  });

  it("throws on a malformed ciphertext (wrong segment count)", () => {
    expect(() => decrypt("not:valid", MASTER_KEY)).toThrow(
      /Invalid ciphertext format/,
    );
  });
});
