---
name: relayos-shared-packages
description: Use whenever writing infrastructure client code in a RelayOS app — a Redis/ioredis connection, a BullMQ Queue or Worker, a Postgres/Drizzle client, a logger setup, or a shared type/enum (execution status, step type, job payload shape). Enforces using the shared package instead of a local copy. Applies to every app in the monorepo.
---

# Shared package boundary

RelayOS is a multi-service monorepo. The single most common mistake is re-instantiating an
infra client (Redis connection, BullMQ queue, Postgres pool, logger) inside an individual app
instead of importing the shared one. This causes duplicated connection config, inconsistent
retry/backoff behavior, and drift between services that are supposed to agree on job shapes.

## The rule

Before writing any of these inside `apps/*`, check the matching package first — import it,
don't recreate it:

| Need                                        | Package           | Notes                                                                                                                                                                               |
| ------------------------------------------- | ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Redis connection                            | `packages/lib`    | One shared ioredis instance, reused for both caching (API key lookups) and BullMQ's connection option                                                                               |
| BullMQ `Queue` / `Worker` / job types       | `packages/queue`  | Queue names and job payload shapes are defined once here and imported by both producer (`ingestion-service`) and consumer (`workflow-service`) — never redefine a job shape locally |
| Postgres client / Drizzle schema            | `packages/db`     | Schema, migrations, and the Drizzle client instance all live here                                                                                                                   |
| Logger                                      | `packages/logger` | Enforces the structured log shape: `{ service, correlationId, executionId, level, msg }`                                                                                            |
| Status enums, step types, shared interfaces | `packages/types`  | e.g. `ExecutionStatus`, `StepType`, `JobPayload<T>` — defined once, imported everywhere                                                                                             |

## When to create a new package

If you're about to write logic that a second app will also need — not "might need someday,"
but a concrete second caller you can name — extract it into a new `packages/<name>` instead of
duplicating. If you're not sure whether a second app needs it yet, leave it in the app; don't
speculatively create a package for a single consumer.

## Anti-patterns to flag

- A `new Redis(...)` or `new Queue(...)` call inside an `apps/*/src/**` file instead of an
  import from `packages/redis-client` or `packages/queue`.
- A locally-defined `type ExecutionStatus = ...` that duplicates (even loosely) something already
  in `packages/types`.
- Two apps defining the same BullMQ queue name as separate string literals instead of both
  importing it from `packages/queue`.
