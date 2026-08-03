# RelayOS — Base Rules

RelayOS is a durable AI-agent workflow execution platform (Temporal-style durability +
LLM-driven planning). Monorepo, Turborepo-managed.

## Code quality — applies everywhere, no exceptions

- No comments that restate what the code does. Comment only _why_, and only when the reason
  isn't obvious from naming (e.g. "retry here because BullMQ doesn't guarantee delivery order").
- One responsibility per function. If a function name needs "and" to describe it, split it.
- One responsibility per file. Route handlers, business logic, and DB access are separate files
  — never mix them.
- No speculative abstraction. Don't build a generic/config-driven version of something until a
  second real caller needs it.
- Naming: `kebab-case` for files and folders, `camelCase` for variables/functions,
  `PascalCase` for types/interfaces/classes, `SCREAMING_SNAKE_CASE` for env vars and true constants.
- Prefer explicit over clever.

## The one non-negotiable architecture rule: packages before app code

**If logic will be needed by more than one app, it goes in `packages/`, never duplicated.**
Before writing any of the following inside an app, check `packages/` first:

| If you're about to write...                                     | Check this package first |
| --------------------------------------------------------------- | ------------------------ |
| A Redis/ioredis client                                          | `packages/redis-client`  |
| A BullMQ `Queue` or `Worker` definition                         | `packages/queue`         |
| A Postgres/Drizzle client or schema                             | `packages/db`            |
| A logger setup                                                  | `packages/logger`        |
| Shared types (execution status enums, job payload shapes, etc.) | `packages/types`         |

If the package doesn't exist yet and a second app will need this logic, **create the package**,
don't write it locally "for now." See `.agents/skills/relayos-shared-packages/SKILL.md` for the
full rule set on when something graduates to a package.

## Monorepo map

| App / Package            | Responsibility                                                                           | Stack                                  |
| ------------------------ | ---------------------------------------------------------------------------------------- | -------------------------------------- |
| `apps/platform-api`      | Auth, projects, API keys, workflow/schedule/tool CRUD, approvals, dashboard reads        | Fastify, Drizzle                       |
| `apps/ingestion-service` | Public trigger endpoint — validate + enqueue only, no execution logic                    | Fastify (thin), BullMQ producer        |
| `apps/workflow-service`  | Execution engine — state machine, step runner, retries, approval pause/resume, scheduler | Fastify (internal API) + BullMQ worker |
| `apps/agent-service`     | Stateless LLM planning calls — no DB, no memory of its own                               | Fastify, LLM SDK                       |
| `apps/memory-service`    | Embedding + vector recall (RAG)                                                          | Fastify, pgvector                      |
| `apps/tool-runtime`      | Validates + executes registered tools                                                    | Fastify                                |
| `apps/dashboard`         | UI over `platform-api`                                                                   | Next.js                                |
| `packages/db`            | Drizzle client + schema, migrations                                                      | —                                      |
| `packages/lib`           | Shared Lib files like http client, redis client                                          | —                                      |
| `packages/queue`         | Shared BullMQ queue definitions + job payload contracts                                  | —                                      |
| `packages/logger`        | Shared Pino logger, structured log shape                                                 | —                                      |
| `packages/types`         | Shared TS types (status enums, step types, job shapes)                                   | —                                      |
| `packages/sdk`           | Public `@relayos/sdk` client                                                             | —                                      |

## Routing — which skills matter where

Each app has its own `AGENTS.md` (nested in its folder) that names the exact skills relevant to
it. Do not pull in a skill unrelated to the app you're currently working in — e.g. `apps/api`
never needs a BullMQ skill, `apps/ingestion-service` never needs a Better Auth skill. If you're unsure
whether a skill applies, check that app's `AGENTS.md` before loading it.
