CREATE EXTENSION IF NOT EXISTS vector;--> statement-breakpoint
CREATE TYPE "memory_chunk_scope" AS ENUM('EXECUTION', 'KNOWLEDGE');--> statement-breakpoint
CREATE TABLE "memory_chunks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"scope" "memory_chunk_scope" NOT NULL,
	"execution_id" uuid,
	"project_id" uuid NOT NULL,
	"source_step_id" uuid,
	"content" text NOT NULL,
	"embedding" vector(768) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_memory_chunks_scope_execution" ON "memory_chunks" ("scope","execution_id");--> statement-breakpoint
CREATE INDEX "idx_memory_chunks_scope_project" ON "memory_chunks" ("scope","project_id");--> statement-breakpoint
ALTER TABLE "memory_chunks" ADD CONSTRAINT "memory_chunks_execution_id_executions_id_fkey" FOREIGN KEY ("execution_id") REFERENCES "executions"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "memory_chunks" ADD CONSTRAINT "memory_chunks_project_id_projects_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "memory_chunks" ADD CONSTRAINT "memory_chunks_source_step_id_execution_steps_id_fkey" FOREIGN KEY ("source_step_id") REFERENCES "execution_steps"("id") ON DELETE SET NULL;--> statement-breakpoint
CREATE INDEX "idx_memory_chunks_embedding" ON "memory_chunks" USING hnsw ("embedding" vector_cosine_ops);