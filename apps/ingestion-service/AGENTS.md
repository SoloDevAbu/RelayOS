# ingestion-service

## What this service does

The public hot-path entry point. `POST /v1/trigger`: validate the API key, validate the
workflow exists, insert a `PENDING` execution row, enqueue a job, return `202` immediately.
That's the entire job of this service — it does no execution work itself.

## What this service explicitly does NOT do

- No step execution, no state machine, no calling `agent-service` or `tool-runtime` directly.
- No local Redis or BullMQ client — always import from `packages/lib` and `packages/queue`.
- No business logic beyond "validate → enqueue → respond."

## Skills that apply here

- Fastify skill (this app is a thin Fastify layer — routing + auth middleware only)
- Redis / BullMQ skill (queue producer patterns, job payload shape, connection reuse)
- `packages/lib` and `packages/queue` conventions — see
  `.agents/skills/relayos-shared-packages/SKILL.md`

**Never applicable here:** Better Auth internals, Drizzle schema design, LLM/agent prompting,
memory/RAG — those belong to other apps.

## Folder convention for this app

```
apps/ingestion-service/src/
  routes/       — POST /v1/trigger and any other public intake routes
  services/     — apiKeyLookup.ts (with Redis cache), enqueueExecution.ts
```

Keep this app small on purpose — if a file here starts doing more than "validate and enqueue,"
that logic belongs in `workflow-service` instead.

## Data ownership

Writes: initial `executions` row only (status `PENDING`). Never updates execution status after
insert — that's `workflow-service`'s job once it picks the job off the queue.
