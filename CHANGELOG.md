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

