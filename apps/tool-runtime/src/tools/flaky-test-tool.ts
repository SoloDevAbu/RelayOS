/**
 * TEST-ONLY FIXTURE — do not register this tool in production workflows.
 *
 * Simulates a flaky external service. Fails with an error for the first
 * `failCount` calls per executionId, then succeeds. This lets you observe
 * the retry path end-to-end (multiple execution_steps rows, exponential
 * delay between them) without a real external dependency.
 *
 * Example step config:
 *   { "toolId": "flaky-test-tool", "input": { "failCount": 2 } }
 * With maxAttempts: 3 — attempt 1 fails, attempt 2 fails, attempt 3 succeeds.
 */

import { registerTool } from "./registry.js";

const callCounts = new Map<string, number>();

registerTool("flaky-test-tool", async (input, executionId) => {
  const failCount = typeof input["failCount"] === "number" ? input["failCount"] : 1;

  const count = (callCounts.get(executionId) ?? 0) + 1;
  callCounts.set(executionId, count);

  if (count <= failCount) {
    throw new Error(
      `flaky-test-tool: simulated failure (call ${count} of ${failCount} configured failures)`,
    );
  }

  return { output: { success: true, callCount: count } };
});
