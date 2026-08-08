interface RetryConfig {
  maxAttempts: number;
  onError: "FAIL" | "SKIP";
}

export type RetryDecision =
  | { action: "retry"; delayMs: number }
  | { action: "skip" }
  | { action: "fail" };

export function decideRetry(config: RetryConfig, attempt: number): RetryDecision {
  if (attempt < config.maxAttempts) {
    return { action: "retry", delayMs: Math.pow(2, attempt) * 1000 };
  }

  if (config.onError === "SKIP") {
    return { action: "skip" };
  }

  return { action: "fail" };
}
