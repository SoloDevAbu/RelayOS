interface RetryConfig {
  maxAttempts: number;
  /**
   * When false, skip straight to the dlq action regardless of remaining
   * attempt budget. A 400 won't succeed on attempt 3 just because attempt 1 and
   * 2 also got 400s — only 5xx, timeouts, and network errors are worth retrying.
   */
  retryable?: boolean;
}

export type RetryDecision =
  | { action: "retry"; delayMs: number }
  | { action: "dlq" };

export function decideRetry(config: RetryConfig, attempt: number): RetryDecision {
  if (config.retryable === false) {
    return { action: "dlq" };
  }

  if (attempt < config.maxAttempts) {
    return { action: "retry", delayMs: Math.pow(2, attempt) * 1000 };
  }

  return { action: "dlq" };
}
