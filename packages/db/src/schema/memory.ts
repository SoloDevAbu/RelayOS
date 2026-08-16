import {
  pgTable,
  pgEnum,
  uuid,
  text,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { vector } from "drizzle-orm/pg-core";
import { projects } from "./auth";
import { executions, executionSteps } from "./workflow";

export const memoryChunkScopeEnum = pgEnum("memory_chunk_scope", [
  "EXECUTION",
  "KNOWLEDGE",
]);

export const memoryChunks = pgTable(
  "memory_chunks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    scope: memoryChunkScopeEnum("scope").notNull(),
    executionId: uuid("execution_id").references(() => executions.id, {
      onDelete: "set null",
    }),
    projectId: uuid("project_id")
      .references(() => projects.id, { onDelete: "cascade" })
      .notNull(),
    sourceStepId: uuid("source_step_id").references(() => executionSteps.id, {
      onDelete: "set null",
    }),
    content: text("content").notNull(),
    embedding: vector("embedding", { dimensions: 768 }).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    scopeExecutionIdx: index("idx_memory_chunks_scope_execution").on(
      t.scope,
      t.executionId,
    ),
    scopeProjectIdx: index("idx_memory_chunks_scope_project").on(
      t.scope,
      t.projectId,
    ),
  }),
);
