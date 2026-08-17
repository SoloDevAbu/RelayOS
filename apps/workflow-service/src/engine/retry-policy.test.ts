import { describe, it, expect } from "vitest";
import { decideRetry, type RetryDecision } from "./retry-policy.js";

interface TestCase {
  desc: string;
  maxAttempts: number;
  onError: "FAIL" | "SKIP";
  attempt: number;
  retryable?: boolean;
  expected: RetryDecision;
}

const cases: TestCase[] = [
  // ── retry branch: attempt < maxAttempts ──────────────────────────────────
  {
    desc: "attempt 1 of 3 FAIL → retry with 2s delay",
    maxAttempts: 3,
    onError: "FAIL",
    attempt: 1,
    expected: { action: "retry", delayMs: 2000 },
  },
  {
    desc: "attempt 2 of 3 FAIL → retry with 4s delay",
    maxAttempts: 3,
    onError: "FAIL",
    attempt: 2,
    expected: { action: "retry", delayMs: 4000 },
  },
  {
    desc: "attempt 1 of 3 SKIP → retry with 2s delay (onError irrelevant while retries remain)",
    maxAttempts: 3,
    onError: "SKIP",
    attempt: 1,
    expected: { action: "retry", delayMs: 2000 },
  },
  {
    desc: "attempt 2 of 3 SKIP → retry with 4s delay",
    maxAttempts: 3,
    onError: "SKIP",
    attempt: 2,
    expected: { action: "retry", delayMs: 4000 },
  },
  {
    desc: "attempt 1 of 2 FAIL → retry with 2s delay",
    maxAttempts: 2,
    onError: "FAIL",
    attempt: 1,
    expected: { action: "retry", delayMs: 2000 },
  },
  // ── exhausted + onError: FAIL ────────────────────────────────────────────
  {
    desc: "attempt 3 of 3 FAIL → fail (exhausted)",
    maxAttempts: 3,
    onError: "FAIL",
    attempt: 3,
    expected: { action: "fail" },
  },
  {
    desc: "attempt 1 of 1 FAIL → fail immediately (maxAttempts=1 means no retries)",
    maxAttempts: 1,
    onError: "FAIL",
    attempt: 1,
    expected: { action: "fail" },
  },
  {
    desc: "attempt 2 of 2 FAIL → fail (exhausted)",
    maxAttempts: 2,
    onError: "FAIL",
    attempt: 2,
    expected: { action: "fail" },
  },
  // ── exhausted + onError: SKIP ────────────────────────────────────────────
  {
    desc: "attempt 3 of 3 SKIP → skip (exhausted)",
    maxAttempts: 3,
    onError: "SKIP",
    attempt: 3,
    expected: { action: "skip" },
  },
  {
    desc: "attempt 1 of 1 SKIP → skip immediately (maxAttempts=1 means no retries)",
    maxAttempts: 1,
    onError: "SKIP",
    attempt: 1,
    expected: { action: "skip" },
  },
  {
    desc: "attempt 2 of 2 SKIP → skip (exhausted)",
    maxAttempts: 2,
    onError: "SKIP",
    attempt: 2,
    expected: { action: "skip" },
  },
  // ── exponential delay verification ──────────────────────────────────────
  {
    desc: "attempt 3 of 5 → delay is 2^3 * 1000 = 8000ms",
    maxAttempts: 5,
    onError: "FAIL",
    attempt: 3,
    expected: { action: "retry", delayMs: 8000 },
  },
  {
    desc: "attempt 4 of 5 → delay is 2^4 * 1000 = 16000ms",
    maxAttempts: 5,
    onError: "FAIL",
    attempt: 4,
    expected: { action: "retry", delayMs: 16000 },
  },
  // ── retryable: false — bypasses retry budget ─────────────────────────────
  {
    desc: "retryable=false + onError FAIL → fail immediately regardless of attempt budget",
    maxAttempts: 3,
    onError: "FAIL",
    retryable: false,
    attempt: 1,
    expected: { action: "fail" },
  },
  {
    desc: "retryable=false + onError SKIP → skip immediately regardless of attempt budget",
    maxAttempts: 3,
    onError: "SKIP",
    retryable: false,
    attempt: 1,
    expected: { action: "skip" },
  },
  {
    desc: "retryable=false on first attempt of 5 → fail (doesn't burn through retries)",
    maxAttempts: 5,
    onError: "FAIL",
    retryable: false,
    attempt: 1,
    expected: { action: "fail" },
  },
];

describe("decideRetry", () => {
  for (const tc of cases) {
    it(tc.desc, () => {
      const result = decideRetry(
        { maxAttempts: tc.maxAttempts, onError: tc.onError, retryable: tc.retryable },
        tc.attempt,
      );
      expect(result).toEqual(tc.expected);
    });
  }
});
