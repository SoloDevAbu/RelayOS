import { hash, verify } from "@node-rs/argon2";

/**
 * Argon2id parameters — OWASP recommended minimums.
 * memoryCost: 64 MiB, timeCost: 3 iterations, parallelism: 4
 */
const ARGON2_OPTIONS = {
  memoryCost: 65536,
  timeCost: 3,
  parallelism: 4,
} as const;

/**
 * Hash a plain-text password using Argon2id.
 */
export async function hashPassword(password: string): Promise<string> {
  return hash(password, ARGON2_OPTIONS);
}

/**
 * Verify a plain-text password against an Argon2id hash.
 */
export async function verifyPassword(
  hashedPassword: string,
  password: string,
): Promise<boolean> {
  return verify(hashedPassword, password);
}
