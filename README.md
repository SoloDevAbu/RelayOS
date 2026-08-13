# RelayOS

RelayOS is a durable AI-agent workflow execution platform built with TypeScript. It relies on a Temporal-style durability model coupled with an LLM-driven planning system, all organized in a Turborepo monorepo.

## Getting Started

To get started with running and developing RelayOS locally, please refer to the [Setup Guide (SETUP.md)](SETUP.md).

## Current Project Status

RelayOS is being built in distinct phases. We are currently up to **Phase 8** of the build plan.

### Completed Phases

- **Phase 1: Platform Data Plane (Auth, Projects, Workflows)**
  - Fully implemented `apps/api`.
  - JWT Session-based Auth, Project CRUD, Workflow definitions.
  - API Key provisioning (SHA-256 hashed storage).
- **Phase 2: Ingestion Service**
  - Fully implemented `apps/ingestion-service`.
  - Scalable and stateless endpoint for external workflow triggers.
  - Validates API Keys and enqueues to `workflow:execute` BullMQ queues.
- **Phase 3: Core Workflow Execution Engine**
  - Fully implemented `apps/workflow-service` execution mechanics.
  - Robust PostgreSQL-backed State Machine utilizing optimistic concurrency.
  - Redis-backed Context Manager for high-performance variable resolution across steps.
  - Deterministic steps implemented: `TOOL_CALL`, `CONDITION`, `DELAY`, and `TRANSFORM`.
- **Phase 4: Retries & Failure Handling**
  - Built resilient delayed-job retries.
  - Granular step retry tracking via `attempt` limits and exponential backoff configuration.
  - `workflow:retry` BullMQ queue processing for resuming directly from the failed step.

- **Phase 5: Human Approval Gate**
  - Implemented `APPROVAL` step type with unbounded pause & resume mechanics.
  - Workflow Service waits indefinitely for external HTTP approvals without holding memory, by preserving execution context in Redis.
  - Exposes internal `POST /internal/executions/:id/resume` and public `POST /approvals/:approvalId/approve|reject` endpoints.
  - Cleanly handles pausing (`RUNNING → WAITING_APPROVAL`), resuming (`WAITING_APPROVAL → RUNNING`), and rejecting (`WAITING_APPROVAL → CANCELLED`).
- **Phase 7: Agent Service**
  - Fully implemented `apps/agent-service`.
  - Stateless AI planner utilizing `@ai-sdk/google` (Gemini).
  - Implements deterministic prompt builder and tool formatter with system-level meta tools (`request_human_approval`, `mark_goal_complete`).
- **Phase 8: Agent Loop Execution**
  - Wired the `AI_PLAN` step type into the core workflow execution engine.
  - Added safety limits via `maxIterations` property on workflow schemas.
  - Handles Agent pauses and re-entries from `APPROVAL` decisions by seamlessly injecting approval results into iteration history.

### Upcoming Goals (Future Phases)

- **[Phase 6] Scheduled Triggers:** Cron-based scheduling worker for recurring workflow triggers.
- **[Phase 9] Memory Service (RAG):** Adding short-lived execution memory and long-term knowledge memory using `pgvector` for OpenAI embeddings.
- **[Phase 10] Harden Tool Runtime:** Full schema validation, robust error capture, and timeout enforcement in `apps/tool-runtime`.
- **[Phase 11] SDK Package:** Publishing `@repo/sdk` for easier programmatic interaction with RelayOS.
- **[Phase 12] Dashboard:** Next.js frontend wrapping Platform API features.
- **[Phase 13] Scalability:** Multi-replica deployments, load testing, and database index tuning.
- **[Phase 14] Observability:** Full cross-service tracing via Langfuse, structured Pino logging, and correlated request IDs.

## Architecture Map

This monorepo manages several specialized microservices to cleanly separate state, logic, and IO.

| App / Package            | Responsibility                                      | Stack                  |
| ------------------------ | --------------------------------------------------- | ---------------------- |
| `apps/platform-api`      | Auth, projects, API keys, workflow CRUD             | Fastify, Drizzle       |
| `apps/ingestion-service` | High throughput trigger queue endpoint              | Fastify, BullMQ        |
| `apps/workflow-service`  | Execution engine (state machine, step runner)       | Fastify, BullMQ Worker |
| `apps/agent-service`     | Stateless AI planner (LLM routing & reasoning)      | Fastify, AI SDK        |
| `apps/tool-runtime`      | Local tool registry and executor                    | Fastify                |
| `packages/db`            | Database schema and Drizzle ORM client              | TypeScript             |
| `packages/queue`         | BullMQ queue interfaces and generic payload types   | TypeScript             |
| `packages/lib`           | Shared utilities (Pino loggers, redis clients, etc) | TypeScript             |
