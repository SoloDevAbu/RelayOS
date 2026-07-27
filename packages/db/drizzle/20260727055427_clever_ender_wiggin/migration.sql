CREATE TYPE "approval_status" AS ENUM('PENDING', 'APPROVED', 'REJECTED');--> statement-breakpoint
CREATE TYPE "executor_type" AS ENUM('HTTP', 'BUILT_IN', 'SDK');--> statement-breakpoint
CREATE TYPE "tool_exec_status" AS ENUM('SUCCESS', 'FAILED', 'TIMEOUT');--> statement-breakpoint
CREATE TYPE "execution_status" AS ENUM('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED', 'WAITING_APPROVAL');--> statement-breakpoint
CREATE TYPE "step_status" AS ENUM('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'WAITING_APPROVAL', 'SKIPPED', 'EXHAUSTED');--> statement-breakpoint
CREATE TYPE "step_type" AS ENUM('AI_PLAN', 'TOOL_CALL', 'APPROVAL', 'CONDITION', 'TRANSFORM', 'DELAY');--> statement-breakpoint
CREATE TYPE "trigger_type" AS ENUM('MANUAL', 'SCHEDULED', 'EVENT');--> statement-breakpoint
CREATE TYPE "workflow_status" AS ENUM('DRAFT', 'ACTIVE', 'INACTIVE');--> statement-breakpoint
CREATE TABLE "approvals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"execution_id" uuid NOT NULL,
	"step_id" varchar(255) NOT NULL,
	"prompt" text NOT NULL,
	"context" jsonb,
	"status" "approval_status" DEFAULT 'PENDING'::"approval_status" NOT NULL,
	"approved_by" uuid,
	"approved_at" timestamp,
	"comment" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "api_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"project_id" uuid NOT NULL,
	"key_hash" varchar(64) NOT NULL UNIQUE,
	"key_prefix" varchar(10) NOT NULL,
	"name" varchar(255) NOT NULL,
	"last_used_at" timestamp,
	"revoked_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"user_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"slug" varchar(100) NOT NULL UNIQUE,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"email" varchar(255) NOT NULL UNIQUE,
	"password_hash" varchar(255) NOT NULL,
	"name" varchar(255),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tool_definitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"project_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text NOT NULL,
	"input_schema" jsonb NOT NULL,
	"output_schema" jsonb,
	"executor_type" "executor_type" NOT NULL,
	"executor_config" jsonb NOT NULL,
	"timeout_ms" integer DEFAULT 30000 NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tool_executions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"execution_id" uuid NOT NULL,
	"step_id" varchar(255) NOT NULL,
	"tool_id" uuid NOT NULL,
	"input" jsonb NOT NULL,
	"output" jsonb,
	"status" "tool_exec_status" NOT NULL,
	"duration_ms" integer,
	"error" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "execution_steps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"execution_id" uuid NOT NULL,
	"step_id" varchar(255) NOT NULL,
	"step_type" "step_type" NOT NULL,
	"status" "step_status" DEFAULT 'PENDING'::"step_status" NOT NULL,
	"input" jsonb,
	"output" jsonb,
	"error" text,
	"attempt" integer DEFAULT 1 NOT NULL,
	"max_attempts" integer DEFAULT 3 NOT NULL,
	"started_at" timestamp,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "executions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"workflow_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"trigger_payload" jsonb,
	"status" "execution_status" DEFAULT 'PENDING'::"execution_status" NOT NULL,
	"current_step_id" varchar(255),
	"correlation_id" varchar(36),
	"started_at" timestamp,
	"completed_at" timestamp,
	"error" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "schedules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"workflow_id" uuid NOT NULL,
	"cron_expression" varchar(255) NOT NULL,
	"timezone" varchar(100) DEFAULT 'UTC' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"next_run_at" timestamp NOT NULL,
	"last_run_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workflows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"project_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"definition" jsonb NOT NULL,
	"trigger_type" "trigger_type" NOT NULL,
	"status" "workflow_status" DEFAULT 'DRAFT'::"workflow_status" NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_approvals_execution_id" ON "approvals" ("execution_id");--> statement-breakpoint
CREATE INDEX "idx_approvals_status" ON "approvals" ("status");--> statement-breakpoint
CREATE INDEX "idx_tool_definitions_project_id" ON "tool_definitions" ("project_id");--> statement-breakpoint
CREATE INDEX "idx_tool_executions_execution_id" ON "tool_executions" ("execution_id");--> statement-breakpoint
CREATE INDEX "idx_tool_executions_tool_id" ON "tool_executions" ("tool_id");--> statement-breakpoint
CREATE INDEX "idx_execution_steps_execution_id" ON "execution_steps" ("execution_id");--> statement-breakpoint
CREATE INDEX "idx_execution_steps_step_id" ON "execution_steps" ("execution_id","step_id");--> statement-breakpoint
CREATE INDEX "idx_executions_workflow_id" ON "executions" ("workflow_id");--> statement-breakpoint
CREATE INDEX "idx_executions_project_id" ON "executions" ("project_id");--> statement-breakpoint
CREATE INDEX "idx_executions_status" ON "executions" ("status");--> statement-breakpoint
CREATE INDEX "idx_executions_created_at" ON "executions" ("created_at");--> statement-breakpoint
CREATE INDEX "idx_schedules_next_run_at" ON "schedules" ("next_run_at");--> statement-breakpoint
CREATE INDEX "idx_workflows_project_id" ON "workflows" ("project_id");--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_execution_id_executions_id_fkey" FOREIGN KEY ("execution_id") REFERENCES "executions"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_approved_by_users_id_fkey" FOREIGN KEY ("approved_by") REFERENCES "users"("id");--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_project_id_projects_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "tool_definitions" ADD CONSTRAINT "tool_definitions_project_id_projects_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "tool_executions" ADD CONSTRAINT "tool_executions_execution_id_executions_id_fkey" FOREIGN KEY ("execution_id") REFERENCES "executions"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "tool_executions" ADD CONSTRAINT "tool_executions_tool_id_tool_definitions_id_fkey" FOREIGN KEY ("tool_id") REFERENCES "tool_definitions"("id");--> statement-breakpoint
ALTER TABLE "execution_steps" ADD CONSTRAINT "execution_steps_execution_id_executions_id_fkey" FOREIGN KEY ("execution_id") REFERENCES "executions"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "executions" ADD CONSTRAINT "executions_workflow_id_workflows_id_fkey" FOREIGN KEY ("workflow_id") REFERENCES "workflows"("id");--> statement-breakpoint
ALTER TABLE "executions" ADD CONSTRAINT "executions_project_id_projects_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id");--> statement-breakpoint
ALTER TABLE "schedules" ADD CONSTRAINT "schedules_workflow_id_workflows_id_fkey" FOREIGN KEY ("workflow_id") REFERENCES "workflows"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "workflows" ADD CONSTRAINT "workflows_project_id_projects_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE;