CREATE TYPE "compensation_status" AS ENUM('PENDING', 'RUNNING', 'COMPLETED', 'FAILED');--> statement-breakpoint
CREATE TYPE "saga_status" AS ENUM('COMPENSATING', 'COMPENSATED', 'COMPENSATION_FAILED');--> statement-breakpoint
ALTER TABLE "execution_steps" ADD COLUMN "compensation_status" "compensation_status";--> statement-breakpoint
ALTER TABLE "execution_steps" ADD COLUMN "compensation_input" jsonb;--> statement-breakpoint
ALTER TABLE "execution_steps" ADD COLUMN "compensation_output" jsonb;--> statement-breakpoint
ALTER TABLE "execution_steps" ADD COLUMN "compensated_at" timestamp;--> statement-breakpoint
ALTER TABLE "executions" ADD COLUMN "is_saga" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "executions" ADD COLUMN "saga_status" "saga_status";