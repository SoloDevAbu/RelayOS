CREATE TYPE "auth_type" AS ENUM('NONE', 'BEARER', 'API_KEY_HEADER', 'BASIC');--> statement-breakpoint
CREATE TYPE "invocation_type" AS ENUM('LOCAL', 'WEBHOOK');--> statement-breakpoint
CREATE TABLE "tool_credentials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"tool_id" uuid NOT NULL UNIQUE,
	"encrypted_value" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tool_definitions" ADD COLUMN "invocation_type" "invocation_type" NOT NULL;--> statement-breakpoint
ALTER TABLE "tool_definitions" ADD COLUMN "url" text;--> statement-breakpoint
ALTER TABLE "tool_definitions" ADD COLUMN "http_method" varchar(10) DEFAULT 'POST' NOT NULL;--> statement-breakpoint
ALTER TABLE "tool_definitions" ADD COLUMN "auth_type" "auth_type" DEFAULT 'NONE'::"auth_type" NOT NULL;--> statement-breakpoint
ALTER TABLE "tool_definitions" ADD COLUMN "auth_header_name" varchar(255);--> statement-breakpoint
ALTER TABLE "tool_definitions" DROP COLUMN "executor_type";--> statement-breakpoint
ALTER TABLE "tool_definitions" DROP COLUMN "executor_config";--> statement-breakpoint
ALTER TABLE "tool_definitions" DROP COLUMN "enabled";--> statement-breakpoint
CREATE UNIQUE INDEX "idx_tool_definitions_project_name" ON "tool_definitions" ("project_id","name");--> statement-breakpoint
ALTER TABLE "tool_credentials" ADD CONSTRAINT "tool_credentials_tool_id_tool_definitions_id_fkey" FOREIGN KEY ("tool_id") REFERENCES "tool_definitions"("id") ON DELETE CASCADE;--> statement-breakpoint
DROP TYPE "executor_type";