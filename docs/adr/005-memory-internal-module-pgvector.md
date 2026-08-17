# ADR 005: Memory as an Internal Module of workflow-service (RAG via pgvector)

**Status:** Accepted  
**Date:** 2026-08-16

## Context

Phase 9 adds a RAG (Retrieval-Augmented Generation) memory layer so that AI_PLAN steps can access:

1. **Execution memory** — tool results accumulated during the current run.
2. **Knowledge memory** — pre-loaded project-level facts that should influence every future run.

The key design question was where this memory logic should live. The original tech doc sketched a standalone `memory-service` with internal HTTP routes (`/internal/embed`, `/internal/recall`). The actual caller analysis showed that `workflow-service` is the only consumer:

- `ai-plan.ts` (inside workflow-service) calls `recall()` synchronously before each planning iteration.
- `ai-plan.ts` enqueues an embed job after each successful tool call.

No other service reads or writes memory.

## Decision

**Make memory an internal module of workflow-service, not a separate deployable.**

The module lives at `apps/workflow-service/src/memory/` and is imported directly. The embed path is still async/durable — it goes through a BullMQ queue and a third BullMQ worker in the same `PROCESS_TYPE=worker` process — but there is no HTTP boundary between the engine and the memory logic.

The schema lives in `packages/db` (alongside every other durable schema) because:
- Drizzle migrations are managed there.
- Other services (e.g., a future dashboard query) can import the schema type without importing workflow-service internals.

## Consequences

### Positive

- **No network hop for recall.** Recall is on the critical path of every AI_PLAN iteration. Eliminating an HTTP call reduces latency and removes a network failure mode from the hot path.
- **Simpler deployment.** One fewer service to run, health-check, and deploy.
- **Durability without bare promises.** Embed still uses BullMQ — it survives worker crashes, has retry semantics, and is observable in the queue dashboard. We get "non-blocking" in the correct sense: "enqueue and continue", not "fire a promise and hope".
- **Consistent patterns.** The retry-worker is already the same shape. Adding a third worker to the same entrypoint is a one-liner.

### Negative / Tradeoffs

- **Cannot scale embedding independently.** If embedding becomes a throughput bottleneck (many concurrent AI_PLAN executions), the only option is increasing `WORKER_CONCURRENCY`, which also increases concurrency for the execution and retry workers. A dedicated embedding process would allow independent scaling. Accepted as a reasonable tradeoff at current scale.
- **Tight coupling.** `memory-service.ts` imports `@relayos/db/client` and `@google/genai` — both now mandatory transitive dependencies of the workflow-service worker. Acceptable since the worker already depends on both.

## Embedding model choice

**`gemini-embedding-2-preview` at `outputDimensionality: 768`.**

Rationale:
- The `GOOGLE_GENERATIVE_AI_API_KEY` is already a required env var for AI_PLAN steps (Gemini is the planning LLM). Reusing the same key for embeddings avoids a second credential.
- 768 dimensions is a good middle ground between quality and storage cost for pgvector HNSW indexing. Gemini's MRL (Matryoshka Representation Learning) approach means 768-dim vectors retain most of the quality of the full 3072-dim output.

## Vector store choice

**pgvector on the existing Postgres instance.**

Rationale:
- No additional infrastructure. The project already uses Postgres via Drizzle.
- HNSW indexes give approximate nearest-neighbor performance acceptable for top-5 recall over millions of chunks.
- Transactional consistency: memory inserts share the same Postgres connection pool and benefit from the same backup/recovery story as the rest of the data.
- A dedicated vector DB (Pinecone, Weaviate, Qdrant) would be appropriate if recall latency or index rebuild time becomes a problem at scale. At that point, `memory-service.ts` is the only file that changes — the queue contract and the AI loop are unaffected.
