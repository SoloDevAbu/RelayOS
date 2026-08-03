# platform-api

## What this service does

Auth, project CRUD, API key CRUD, workflow/schedule/tool definition CRUD,
approval decisions, and dashboard read endpoints (direct Postgres reads, no service hops).

## What this service explicitly does NOT do

- No BullMQ, no Redis queue logic, no job enqueueing — that's `ingestion-service`.
- No workflow execution logic, no step runner, no state machine — that's `workflow-service`.
- No LLM calls — that's `agent-service`.
  If a task in this app starts needing any of the above, stop and check whether the logic actually
  belongs in another app instead.

## Skills that apply here

- Fastify best practices skill (route structure, plugin registration, schema validation,
  error handling)
- `packages/db` conventions (Drizzle client, migrations) — see
  `.agents/skills/relayos-shared-packages/SKILL.md`

## Folder convention for this app

```
apps/platform-api/src/
  routes/       — Fastify route definitions only. No business logic, no DB queries inline.
  services/     — business logic, one file per domain (auth.ts, projects.ts, apiKeys.ts, workflows.ts)
  schemas/      — Typebox Schema request & response validation, one file per domain
  plugins/      — Fastify plugin registration (auth middleware, error handler, etc.)
  config/       — env validation, secrets loading which are only applicable for this app
  lib/          — lib files which are only applicable for this app
  constants/    — constants which are only applicable for this app
```

A route handler should be a thin wrapper: parse/validate input → call a service function →
return the result. Business logic never lives in `routes/`.
