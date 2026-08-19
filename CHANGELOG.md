# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Added

- **Platform API (`apps/api`)**
  - Initialized Fastify server with `TypeBoxTypeProvider` for robust runtime validation and type inference.
  - Configured core plugins: Database, JWT authentication, CORS, Helmet (security headers), Rate Limiting, Error Handling, and Swagger/OpenAPI documentation.
  - Implemented request/response hooks for structured JSON logging with Pino.
  - Established routing structure and scaffolding for core entities:
    - `auth`: User authentication endpoints.
    - `projects`: Project management CRUD.
    - `api-keys`: API key provisioning and management.
    - `workflows`: Workflow and definition CRUD.
    - `health`: Liveness and readiness probes.

- **Ingestion Service (`apps/ingestion-service`)**
  - Created a thin, high-throughput Fastify service dedicated to accepting workflow triggers from external clients.
  - Integrated `redisPlugin` for interacting with BullMQ for job enqueuing.
  - Set a strict 1MB body limit to optimize for small trigger payloads and prevent abuse.
  - Created `/v1/trigger` route to accept incoming execution requests.
  - Implemented `services/api-key-lookup.ts` for fast, secure validation of inbound trigger API keys.
  - Implemented `services/enqueue-execution.ts` to reliably push validated payloads to the workflow execution queue, completely decoupling ingestion from execution logic.

- **Workflow Service (`apps/workflow-service`)**
  - Implemented the core engine state machine (`state-machine.ts`) to handle rigorous execution and step status transitions, leveraging optimistic concurrency control.
  - Developed a Context Manager (`context-manager.ts`) backed by Redis for fast, hot-cache aggregation of step outputs during workflow execution, falling back to PostgreSQL when needed.
  - Defined local strict TypeScript interfaces (`WorkflowDefinition`, `WorkflowStep`, `ExecutionContext`) to guide the engine's internal type-safety.
  - Built the `StepRunner` engine (`step-runner.ts`) to orchestrate step execution sequences, resolving dynamic contexts and branching logic on-the-fly.
  - Implemented core step handlers:
    - `TOOL_CALL`: Executes external tools via HTTP calls to the `tool-runtime`.
    - `CONDITION`: Evaluates branch logic dynamically against the current execution context.
    - `DELAY`: Awaits specified durations for time-based workflow steps.
  - Configured Vitest and wrote comprehensive unit tests ensuring rock-solid transition paths, context resolution, and handler implementations.
  - Implemented the `execution-service` module providing shared database access (fetching definitions, pre-inserting step rows) decoupled from execution logic.
  - Built the `execution-worker` to process `WorkflowExecuteJob` tasks from BullMQ, orchestrating the full workflow lifecycle by tying together the state machine, context manager, and step runner.
  - Wired the worker process entrypoint (`src/worker/index.ts`) with concurrency controls, robust logging, and graceful shutdown handlers for Redis/BullMQ connections.
  - Established shared environment configuration (`env-schema`) ensuring strict runtime validation across both execution contexts (API and Worker).
  - Built a thin internal Fastify API exposing a strictly validated `/health` endpoint for service monitoring.
  - Implemented a unified top-level entrypoint (`src/index.ts`) acting as a process router. It dynamically imports and boots either the API server or the Worker process based on the `PROCESS_TYPE` environment variable, ensuring a clean separation of memory dependencies.

### Changed

- **Workflow Service (`apps/workflow-service`)**
  - Extended `CONDITION` handler to support an `expression` config format (e.g. `"{{payload.flag}} == true"`) in addition to the existing structured `field`/`operator`/`onTrue`/`onFalse` format. Expression-mode routes via the step-level `onSuccess`/`onFailure` fields and supports `==` and `!=` comparisons with `{{payload.x}}` and `{{steps.stepId.field}}` template resolution.
  - Fixed `vi.mock` factory hoisting bug in `context-manager.test.ts` and `state-machine.test.ts` — mock variables are now declared with `vi.hoisted()` so they are available when Vitest lifts the factory to the top of the module.

### Added

- **Workflow Service (`apps/workflow-service`)**
  - Implemented `TRANSFORM` step handler (`handlers/transform.ts`): evaluates a `mapping` config object, resolving `{{payload.field}}` and `{{steps.stepId.field}}` templates against the current execution context. Single-template values preserve their original type (e.g. a boolean payload field stays `boolean`); interpolated strings coerce unresolvable references to `""`.
  - Registered `TRANSFORM` in the step handler registry (`handlers/index.ts`).
  - Added full unit test suite for `handleTransform` (`handlers/transform.test.ts`): 12 tests covering static pass-through, payload and step-output template resolution, type preservation, string interpolation, multiple templates, missing references, null payload safety, and missing `mapping` config error.
  - Expanded `condition.test.ts` with a dedicated `expression format` describe block (8 new tests) covering `==`/`!=` evaluation, payload and step-output resolution, unresolvable reference fallback, and `step.onSuccess`/`step.onFailure` routing.

### Added

- **Queue Package (`packages/queue`)**
  - Added `WorkflowRetryJob` interface (`executionId`, `workflowId`, `projectId`, `stepId`, `attempt`) for typed retry job payloads. `QUEUES.WORKFLOW_RETRY` was already defined; this completes the contract.

- **Workflow Service (`apps/workflow-service`) — Phase 4: Retries & Failure Handling**
  - Added `src/engine/retry-policy.ts`: a pure, side-effect-free `decideRetry(config, attempt)` function. Given a step's `maxAttempts` / `onError` config and the current attempt number, returns one of `{ action: "retry", delayMs }` (exponential backoff: `2^attempt × 1000ms`), `{ action: "skip" }`, or `{ action: "fail" }`. No I/O — fully unit-testable in isolation.
  - Added 14 table-driven unit tests in `retry-policy.test.ts` covering every combination of attempt count, `maxAttempts`, and `onError`.
  - Reworked the step-runner failure branch (`step-runner.ts`): on `catch`, now calls `decideRetry` and acts on the result — retry: enqueues a delayed `WorkflowRetryJob` and exits the current job cleanly; skip: transitions step `FAILED → SKIPPED` and continues to the next step; fail: returns failure (existing Phase 3 behavior).
  - Added `startFromStepId` option to `runSteps` so the retry worker can resume mid-workflow from the specific failed step without restarting from step 0.
  - Added `enqueueRetry` as an injected dependency on `StepRunnerDeps` to keep the queue producer testable without a live Redis connection.
  - Updated `StepRunResult` with `retryEnqueued?: boolean` so `execution-worker` knows not to fail the execution when a retry has been scheduled.
  - Added `src/worker/retry-worker.ts`: a second BullMQ Worker bound to `QUEUES.WORKFLOW_RETRY`. On each job it inserts a new `PENDING` step row for the retry attempt, loads the latest step rows, and calls `runSteps` with `startFromStepId`. This mirrors execution-worker's lifecycle (success → COMPLETED, fail → FAILED, another retry → exits cleanly).
  - Wired the retry worker alongside the execution worker in `src/worker/index.ts`. Both share the same `bullmqRedis` connection; shutdown closes both concurrently.
  - Updated `execution-worker.ts`: when `retryEnqueued === true`, exits without failing the execution and without deleting the Redis context (the retry worker will need it for the next attempt).
  - Added `insertRetryStepRow` to `execution-service.ts` for inserting a new PENDING row per retry attempt.
  - Added `getLatestStepRows` to `execution-service.ts` — returns one row per `stepId` at its highest `attempt` via a SQL subquery, used by the retry worker to build the correct row map.
  - Expanded `step-runner.test.ts` with new describe blocks: retry enqueue with correct delay, exponential backoff verification, skip continuing to the next step, skip on last step resolving to success, fail exhaustion, and `startFromStepId` mid-workflow resume.
  - Expanded `execution-worker.test.ts` with a test asserting that `retryEnqueued=true` does not transition execution to FAILED and does not clean up the context.

- **Database (`packages/db`)**
  - Changed `execution_steps` index from a non-unique `(execution_id, step_id)` index to a `UNIQUE` index on `(execution_id, step_id, attempt)`. Each retry attempt is stored as a distinct row — full retry history is visible in `execution_steps` without overwriting earlier attempts.
  - Generated and applied migration.

- **Tool Runtime (`apps/tool-runtime`)**
  - Scaffolded minimal Fastify service on port 8080 (matching `workflow-service`'s `TOOL_RUNTIME_URL` default).
  - Added `POST /v1/tools/:toolId/execute` route backed by an in-memory tool registry.
  - Added `src/tools/flaky-test-tool.ts` — **test-only fixture**: an in-memory per-`executionId` call counter that throws on the first N calls (`input.failCount`) then returns success, enabling end-to-end retry path testing over real HTTP without external dependencies.

### Changed

- **Workflow Service (`apps/workflow-service`)**
  - `WorkflowStep.maxRetries` renamed to `maxAttempts` (semantic: `maxAttempts: 3` = 3 total tries, not 3 retries after the first). `onError?: "FAIL" | "SKIP"` added to `WorkflowStep`.
  - `insertExecutionSteps` now explicitly sets `attempt: 1` on every row.
  - `ExecutionStepRow` interface extended with `attempt: number` across service, step-runner, and worker code.
  - `runSteps` signature extended: takes `workflowId` and `projectId` (needed to populate `WorkflowRetryJob` without extra DB round-trips) and an optional `RunStepsOptions` object.
  - State machine `STEP_TRANSITIONS` extended: `FAILED → RUNNING` (retrying) and `FAILED → SKIPPED` (exhausted, `onError=SKIP`) are now legal transitions.

### Added

- **Platform API & Workflow Service (`apps/api`, `apps/workflow-service`) — Phase 5: Human Approval Gate**
  - Added `APPROVAL` step handler (`handlers/approval.ts`): Inserts a `PENDING` approval record into the database, optionally with a prompt, and signals the worker to pause the workflow.
  - Modified the State Machine (`state-machine.ts`): Added `WAITING_APPROVAL` and `CANCELLED` statuses. Added legal transitions for pausing (`RUNNING → WAITING_APPROVAL`), resuming (`WAITING_APPROVAL → RUNNING`), and rejecting (`WAITING_APPROVAL → CANCELLED`).
  - Updated `StepRunner` (`step-runner.ts`): Recognizes `pause: true` signals from handlers. Safely pauses execution, writes the current step ID to the DB, transitions to `WAITING_APPROVAL`, and exits cleanly without error or retry.
  - Updated `execution-worker.ts` and `retry-worker.ts`: Handles pause signals by preserving the in-memory execution context (Redis) rather than cleaning it up. `execution-worker.ts` now handles `resumeFromStepId` payloads to pick up exactly where a workflow left off.
  - Implemented Internal Resume API in Workflow Service (`api/routes/resume.ts`): `POST /internal/executions/:id/resume`. Re-enqueues `WorkflowExecuteJob` with `resumeFromStepId` on approval, or cancels execution on rejection. Protected by `x-internal-secret` header.
  - Implemented Public Approval API in Platform API (`apps/api/src/routes/approvals`): `POST /approvals/:approvalId/approve` and `/reject`. Includes validation to ensure the user owns the project the approval belongs to. Updates the approval record and calls the Workflow Service's internal resume endpoint.
  - Added Drizzle migration to include `CANCELLED` in the Postgres `step_status` enum.

- **Agent Service (`apps/agent-service`)**
  - Initialized a stateless Fastify service dedicated to AI planning and decision making.
  - Implemented `/internal/plan` endpoint to accept a `goal`, `context`, `memories`, `iterationHistory`, and `availableTools`.
  - Integrated the Vercel AI SDK and Google Generative AI (`gemini-2.0-flash`) for executing planning cycles.

### Changed

- **Agent Service (`apps/agent-service`)**
  - Replaced brittle string-matching heuristics (`looksLikeCompletion`) with explicit "Control Tools" (`mark_goal_complete`, `request_human_approval`) leveraging Vercel AI SDK's `toolChoice: "required"` to enforce deterministic outputs.
  - Implemented dynamic, strict tool schema validation using the SDK's native `jsonSchema()` utility instead of an empty passthrough.
  - Restructured prompts to leverage native `instructions` (system prompt) and `messages` separation, preventing context pollution and prompt injection risks.
  - Introduced a `PlanningError` class for robust error handling, explicitly managing edge cases like content filter violations, context length limits, and missing tool calls.

### Added

- **Workflow Service (`apps/workflow-service`) — AI_PLAN Step Handler**
  - Implemented `AI_PLAN` step handler (`handlers/ai-plan.ts`): an autonomous agent loop that calls the Agent Service to decide the next action (`tool_call`, `request_approval`, or `complete`). Each iteration's decision and tool result is recorded in `iterationHistory` stored in Redis via the Context Manager.
  - Added `maxIterations` support (default 10) — throws `AiPlanMaxIterationsError` when exceeded.
  - Integrated with `call-tool.ts` to execute agent-chosen tools via the Tool Runtime, and with the approval system for agent-initiated `request_approval` decisions.
  - Updated `execution-worker.ts` to handle AI_PLAN resume after approval — reloads iteration history and continues the agent loop rather than advancing to the next step.
  - Added `getIterationHistory` and `updateIterationHistory` to the Context Manager for persisting per-step agent loop state in Redis.

- **Documentation (`docs/`)**
  - Added `docs/getting-started.mdx`: comprehensive step-by-step guide covering signup, project creation, API key provisioning, workflow definition (all 6 step types), activation, triggering, execution lifecycle, approval/rejection, retry behavior, a full AI_PLAN end-to-end example, architecture diagram, environment variables reference, and troubleshooting.

### Fixed

- **Workflow Service (`apps/workflow-service`) — AI_PLAN Tool Error Handling**
  - Fixed critical bug where tool call failures (HTTP 500 from Tool Runtime) inside the AI_PLAN agent loop would throw an uncaught `ToolCallError`, bubbling out of the handler and causing the entire step to fail immediately. The agent never saw the error and had no chance to replan.
  - `callTool()` inside the AI_PLAN loop is now wrapped in a try/catch. On `ToolCallError` or `ToolRuntimeUnreachableError`, the error is recorded as an iteration history entry (`result: { error: "..." }`) and the loop continues — the agent sees the failure on the next iteration and can retry, pick a different tool, or request human help.
  - Added structured logging of every agent decision (`tool_call`, `complete`, `request_approval`) from within the workflow-service worker, including tool name, iteration count, and reasoning. Previously, agent decisions were only visible in agent-service logs.
  - `iterationHistory` is now included in the step's `output` on both `complete` and `request_approval`, so it is persisted to `execution_steps.output` in PostgreSQL. Previously, iteration history was stored only in Redis and lost when the execution context was deleted in the `finally` block.

### Added

- **Workflow Service (`apps/workflow-service`) — Phase 9: Memory (RAG)**
  - Added an internal `memory` module (`src/memory/`) providing RAG-backed context recall for AI_PLAN steps. No separate deployable — all logic lives inside workflow-service as a direct dependency.
  - Added `src/memory/embedding-client.ts`: thin wrapper around the Google Generative AI API (`gemini-embedding-2-preview`) producing 768-dimensional vectors. Single file that imports the `@google/genai` SDK — all embedding calls go through here.
  - Added `src/memory/memory-service.ts` with two functions:
    - `recall(query, executionId, projectId, topK)` — embeds the query text, runs a pgvector cosine similarity search scoped to `execution_id = X OR (scope = 'KNOWLEDGE' AND project_id = Y)`, returns the top-K chunks as `{ content, similarity }[]`. Called synchronously inside the AI loop before each agent planning call.
    - `embed(content, scope, ids)` — embeds text and inserts a `memory_chunks` row. Called by the BullMQ worker, not the loop directly.
  - Added `src/worker/memory-embed-worker.ts`: third BullMQ Worker in the `PROCESS_TYPE=worker` entrypoint, bound to the `memory:embed` queue. Processor calls `memoryService.embed()` with the job payload.
  - Updated `src/worker/index.ts`: added `memoryEmbedWorker` alongside `executionWorker` and `retryWorker`. All three share the same Redis connection and shut down gracefully together.
  - Updated `src/engine/handlers/ai-plan.ts`:
    - Calls `recall(goal, executionId, projectId, 5)` before every `callAgentPlan()` call; recalled memories are passed as the `memories` array in the planning request (previously hardcoded `[]`).
    - After each successful tool call, enqueues a durable `memory:embed` job (`scope: EXECUTION`) summarising the tool name, input, and result. Only the enqueue is awaited — the embedding itself is async.
  - Added `scripts/seed-knowledge-memory.ts`: one-off CLI script for inserting `KNOWLEDGE`-scope memory chunks into a project for testing recall without a prior execution.

- **Database (`packages/db`) — Phase 9: memory_chunks table**
  - Added `memoryChunkScopeEnum` (`EXECUTION | KNOWLEDGE`) and `memoryChunks` table to `packages/db/src/schema/memory.ts`.
  - `embedding` column is `vector(768)` — matches `gemini-embedding-2-preview`'s output at `outputDimensionality: 768`.
  - B-tree indexes on `(scope, execution_id)` and `(scope, project_id)` for pre-filtering before the vector scan.
  - Migration enables the `vector` extension (`CREATE EXTENSION IF NOT EXISTS vector`) and creates an HNSW cosine-ops index (`idx_memory_chunks_embedding`) for approximate nearest-neighbor search.
  - Exported from `schema/index.ts`.

- **Queue Package (`packages/queue`) — Phase 9**
  - Added `MemoryEmbedJob` interface (`content`, `scope`, `executionId?`, `projectId`, `sourceStepId?`). The queue name `MEMORY_EMBED` already existed; this completes the payload contract.

- **Types Package (`packages/types`) — Phase 9**
  - Added `projectId: string` to `ExecutionContext`. Required for memory scoping — the AI plan handler needs the project ID to include KNOWLEDGE-scope chunks from prior executions in the same project.

- **Infrastructure**
  - Switched `docker-compose.yml` Postgres image from `postgres:16-alpine` to `pgvector/pgvector:pg16` to support the pgvector extension required by the memory schema.

  ### Added

- **Platform API & Tool Runtime (`apps/api`, `apps/tool-runtime`) — Phase 10: Tool Registry + Hardened Webhook Execution**
  - Replaced the hardcoded in-memory tool registry with a real, user-owned tool registration system backed by PostgreSQL.
  - Added new Database Schema for `toolDefinitions` with `invocationType` (LOCAL, WEBHOOK), `authType`, and separate `toolCredentials` table.
  - Added AES-256-GCM encryption module in `packages/lib/src/crypto` to encrypt tool credentials at rest.
  - Created Tool CRUD endpoints (`/projects/:projectId/tools`) in the Platform API with strict TypeBox validation.
  - Restructured `tool-runtime` to pull configurations from the database and decrypt credentials on-demand.
  - Added Ajv-based input schema validation in `tool-runtime` to fail fast on malformed inputs before initiating network calls.

- **Workflow Service (`apps/workflow-service`) — Phase 10.5(a): Dead Letter Queue Implementation**
  - Refactored `step-runner.ts` and `retryPolicy.ts` to implement a "Single Authority" Dead Letter Queue pattern.
  - Created a new `dlq-worker.ts` to own all terminal step decisions (SKIP step vs FAIL execution).
  - Added `WORKFLOW_DLQ` queue and `DlqJob` to `packages/queue`.
  - Added `iterationHistory` capture to `AiPlanMaxIterationsError` so that AI-planner tool call loops that exceed max iterations are preserved in the DLQ for debugging.
  - Simplified `retryPolicy.ts` to return only `retry` or `dlq` decisions.
  - Implemented `webhook-executor` with `AbortController` timeouts and standard `Idempotency-Key` headers for robust external API calls.
  - Added a `result-shaper` in `tool-runtime` to standardize output as `ToolExecutionResult`, intelligently setting `retryable: true` for 5xx/network errors and `retryable: false` for 4xx errors.
  - Updated Workflow Service's retry policy to bypass retry budgets entirely on `retryable: false` tool call errors.
