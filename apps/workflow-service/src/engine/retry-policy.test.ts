import { describe, it, expect } from "vitest";
import { decideRetry, type RetryDecision } from "./retry-policy.js";

interface TestCase {
  desc: string;
  maxAttempts: number;
  attempt: number;
  retryable?: boolean;
  expected: RetryDecision;
}

const cases: TestCase[] = [
  // ── retry branch: attempt < maxAttempts ──────────────────────────────────
  {
    desc: "attempt 1 of 3 → retry with 2s delay",
    maxAttempts: 3,
    attempt: 1,
    expected: { action: "retry", delayMs: 2000 },
  },
  {
    desc: "attempt 2 of 3 → retry with 4s delay",
    maxAttempts: 3,
    attempt: 2,
    expected: { action: "retry", delayMs: 4000 },
  },
  {
    desc: "attempt 1 of 2 → retry with 2s delay",
    maxAttempts: 2,
    attempt: 1,
    expected: { action: "retry", delayMs: 2000 },
  },
  // ── exhausted: retries depleted → dlq ───────────────────────────────────
  {
    desc: "attempt 3 of 3 → dlq (exhausted)",
    maxAttempts: 3,
    attempt: 3,
    expected: { action: "dlq" },
  },
  {
    desc: "attempt 1 of 1 → dlq immediately (maxAttempts=1 means no retries)",
    maxAttempts: 1,
    attempt: 1,
    expected: { action: "dlq" },
  },
  {
    desc: "attempt 2 of 2 → dlq (exhausted)",
    maxAttempts: 2,
    attempt: 2,
    expected: { action: "dlq" },
  },
  // ── exponential delay verification ──────────────────────────────────────
  {
    desc: "attempt 3 of 5 → delay is 2^3 * 1000 = 8000ms",
    maxAttempts: 5,
    attempt: 3,
    expected: { action: "retry", delayMs: 8000 },
  },
  {
    desc: "attempt 4 of 5 → delay is 2^4 * 1000 = 16000ms",
    maxAttempts: 5,
    attempt: 4,
    expected: { action: "retry", delayMs: 16000 },
  },
  // ── retryable: false — bypasses retry budget, goes straight to dlq ───────
  {
    desc: "retryable=false on attempt 1 of 3 → dlq immediately (no point retrying a 400)",
    maxAttempts: 3,
    retryable: false,
    attempt: 1,
    expected: { action: "dlq" },
  },
  {
    desc: "retryable=false on attempt 1 of 5 → dlq (doesn't burn through retries)",
    maxAttempts: 5,
    retryable: false,
    attempt: 1,
    expected: { action: "dlq" },
  },
  {
    desc: "retryable=false on attempt 1 of 1 → dlq",
    maxAttempts: 1,
    retryable: false,
    attempt: 1,
    expected: { action: "dlq" },
  },
];

describe("decideRetry", () => {
  for (const tc of cases) {
    it(tc.desc, () => {
      const result = decideRetry(
        { maxAttempts: tc.maxAttempts, retryable: tc.retryable },
        tc.attempt,
      );
      expect(result).toEqual(tc.expected);
    });
  }
});

