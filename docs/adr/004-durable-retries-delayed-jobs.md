# 4. Durable Retries via Delayed BullMQ Jobs

Date: 2026-08-08

## Status

Accepted

## Context

When a workflow step fails (handler throws), the engine needs to decide whether to retry, skip, or fail the execution. Three implementation options were considered for retries:

1. **In-memory retry loop** — catch the error, `sleep(delay)`, re-run the handler in the same BullMQ job.
2. **BullMQ's built-in `attempts`** — configure `attempts: N` on the job; BullMQ re-delivers the *entire job* on failure.
3. **Separate delayed job on a dedicated queue** — on step failure, enqueue a new delayed job on `workflow:retry` and exit the current job cleanly.

## Decision

We chose **option 3**: a separate `workflow:retry` queue with delayed jobs.

The specific design:
- `decideRetry(config, attempt)` is a pure function that returns `{ action, delayMs }`, `{ action: "skip" }`, or `{ action: "fail" }`. Exponential backoff: `2^attempt × 1000ms`.
- On `retry`, `step-runner.ts` enqueues a `WorkflowRetryJob` with `delay: delayMs` and exits cleanly.
- `retry-worker.ts` consumes `workflow:retry` in the same worker process as `execution-worker.ts` (two `Worker` instances, one shared Redis connection).
- Each retry attempt is a **new row** in `execution_steps` (`attempt` column), enforced by a unique constraint on `(execution_id, step_id, attempt)`.

## Consequences

### Why not option 1 (in-memory loop)?

If the worker process crashes or is restarted between attempt 1 and attempt 2, the in-memory counter is lost. The job gets re-delivered from the beginning (attempt 1), resetting the retry count and breaking exponential backoff. This is the same class of durability failure that motivates using BullMQ over cron jobs in the first place.

### Why not option 2 (BullMQ built-in attempts)?

BullMQ's built-in retry re-delivers the *entire* `WorkflowExecuteJob`, which re-runs the workflow from step 0. In a multi-step workflow, steps that already completed successfully would re-execute — potentially causing duplicate side effects (double-charging, double-sending, etc.). We need retry at the *step* granularity, not the *execution* granularity.

### Why option 3?

- **Crash-safe**: Delayed BullMQ jobs are persisted in Redis. A process crash between attempts does not lose the retry — the delayed job is redelivered once the delay expires, regardless of which worker picks it up.
- **Step-granular**: The retry job carries `stepId` and `attempt`, so the retry worker resumes exactly at the failed step (via `startFromStepId`) without re-running prior steps.
- **Full audit trail**: One DB row per attempt means the dashboard (or any query) can show the complete retry history for a step without any joins or aggregation tricks.
- **Testable**: `decideRetry` has zero I/O and is table-tested with every combination of `attempt`/`maxAttempts`/`onError`. The `enqueueRetry` dependency is injected, so step-runner tests mock it without a live Redis connection.

### Trade-offs accepted

- **Two workers in one process**: Running `execution-worker` and `retry-worker` in the same process is supported by BullMQ (multiple `Worker` instances share one connection). If either worker becomes CPU-bound, they can be split into separate processes without code changes — just move one `Worker` instantiation to a separate entrypoint.
- **Redis as retry store**: Delayed jobs live in Redis, so a Redis data loss event (without AOF/RDB persistence) would lose pending retries. This is acceptable given that Postgres holds the authoritative execution state and a manual re-trigger can recover from it.
