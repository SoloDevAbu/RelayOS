# workflow-service

## What this service does

The execution engine. Two processes from one codebase (`PROCESS_TYPE=api` / `PROCESS_TYPE=worker`):
the worker consumes jobs from `workflow-execute`, walks a workflow's steps via the state machine,
and persists progress to Postgres/Redis so execution never depends on an in-memory process state.
The api process exposes internal-only routes (health, and eventually resume-after-approval).

## What this service explicitly does NOT do

- No public-facing routes — `ingestion-service` owns the only public entry point.
- No auth/project/API-key/workflow CRUD — that's `platform-api`.
- No LLM calls of its own — `AI_PLAN` steps call out to `agent-service`(not build yet), this service only
  orchestrates the loop, it doesn't do the reasoning.
- No queue _definitions_ — job/queue shapes are defined once in `packages/queue` and imported,
  not redeclared here.

## Skills that apply here

- Fastify skill (api process only — routing, plugin registration)
- Redis / BullMQ skill (worker process — consumer patterns, concurrency, job locking)
- `packages/db`, `packages/queue`, `packages/lib` conventions — see
  `.agents/skills/relayos-shared-packages/SKILL.md`

## Folder convention for this app

apps/workflow-service/src/
api/ — Fastify app, PROCESS_TYPE=api. Internal routes only.
routes/
worker/ — BullMQ Worker, PROCESS_TYPE=worker. No HTTP framework.
executionWorker.ts — orchestrates: load → transition → run steps → transition
engine/ — the actual execution logic, used only by worker/
stateMachine.ts — the only place status gets written
contextManager.ts — ExecutionContext read/write (Redis + Postgres)
stepRunner.ts — routes steps to handlers, walks them in order
handlers/ — one file per step type
services/ — shared read logic used by both api and worker processes
schemas/
plugins/ — api process only

## Data ownership

Owns: `executions`, `execution_steps`, `schedules` (from Phase 6, not build yet), `approvals` writes for status
transitions (approval _decisions_ still come in through `platform-api`, but the resulting
execution resume is this service's job). Reads `workflows` (owned by `platform-api`) — never
writes to it.

## Testing

- **Unit tests**: colocated. Every function in `engine/` and `services/` gets one — this is the
  core of the platform, don't skip coverage here even for "obvious" functions.
