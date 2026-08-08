# 3. Workflow Engine Architecture

Date: 2026-08-08

## Status

Accepted

## Context

RelayOS requires a durable, scalable workflow execution engine to process jobs enqueued by the Ingestion Service. The engine must safely handle dynamic execution graphs (including branching and delays), integrate with external tool runtimes, and ensure that workflow state is preserved securely across potential process crashes or infrastructure failures.

## Decision

We have decided to build the `workflow-service` with the following architectural pillars:

### 1. Dual-Process Architecture
The service acts as a monolith codebase but runs as two distinct processes determined by the `PROCESS_TYPE` environment variable:
- **`worker`**: The BullMQ job processor that pulls workflows from the queue and executes them.
- **`api`**: A Fastify API that exposes health checks and future internal endpoints.
*Why:* By using dynamic imports in the top-level router (`src/index.ts`), we ensure strict memory isolation. The worker never loads the Fastify server, and the API never loads the BullMQ orchestration logic, optimizing memory usage while keeping shared logic (DB, Config) in one package.

### 2. Strict State Machine
All writes to execution and step statuses in the PostgreSQL database are routed through a rigid State Machine (`state-machine.ts`). 
*Why:* It uses optimistic concurrency control to prevent race conditions. If a worker attempts to transition a step from `PENDING` to `RUNNING`, but it's already `RUNNING`, the transition is rejected. This prevents duplicate step executions.

### 3. Redis-Backed Context Manager
During a workflow execution, the output of each step is aggregated into an `ExecutionContext`.
*Why:* Instead of reading and joining rows from PostgreSQL for every step to resolve variables, we use a Context Manager that hot-caches the aggregated context in **Redis** with a 1-hour TTL. It writes-through to Redis during execution and falls back to reconstructing the context from PostgreSQL on cache misses (e.g., if Redis restarts).

### 4. Dynamic Step Runner & Handlers
The engine iterates through the workflow definition graph dynamically, dispatching execution to specialized handlers:
- `TOOL_CALL`: For interacting with external APIs via the Tool Runtime.
- `CONDITION`: For evaluating JSON paths against the Context Manager to determine branching.
- `DELAY`: For time-based pauses.

## Consequences

- **Positive:** High durability (Postgres), extremely fast step-to-step resolution (Redis hot-cache), and excellent scalability (independent worker scaling). The dynamic handler pattern makes it trivial to add new step types (e.g., `AI_PLAN`) in the future.
- **Negative/Risk:** Redis is elevated to a critical operational dependency not just for queuing, but for performance during execution context resolution. While Postgres fallback exists, a Redis outage will severely degrade performance.
