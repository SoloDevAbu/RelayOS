// import { vector } from "drizzle-orm/pg-core";
// import {
//   pgTable,
//   pgEnum,
//   uuid,
//   text,
//   timestamp,
//   jsonb,
//   index,
// } from "drizzle-orm/pg-core";
// import { projects } from "./auth";
// import { executions } from "./workflow";

// export const memoryTypeEnum = pgEnum("memory_type", [
//   "EXECUTION",
//   "KNOWLEDGE",
//   "SUMMARY",
// ]);

// export const memories = pgTable(
//   "memories",
//   {
//     id: uuid("id").defaultRandom().primaryKey(),
//     projectId: uuid("project_id")
//       .references(() => projects.id, { onDelete: "cascade" })
//       .notNull(),
//     executionId: uuid("execution_id").references(() => executions.id, {
//       onDelete: "set null",
//     }),
//     content: text("content").notNull(),
//     embedding: vector("embedding", { dimensions: 1536 }).notNull(), // text-embedding-3-small
//     type: memoryTypeEnum("type").notNull(),
//     metadata: jsonb("metadata"),
//     createdAt: timestamp("created_at").defaultNow().notNull(),
//   },
//   (t) => ({
//     projectIdx: index("idx_memories_project_id").on(t.projectId),
//     executionIdx: index("idx_memories_execution_id").on(t.executionId),
//     // pgvector HNSW index — created via raw SQL migration:
//     // CREATE INDEX idx_memories_embedding ON memories USING hnsw (embedding vector_cosine_ops);
//   }),
// );
