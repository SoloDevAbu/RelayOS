CREATE TABLE "refresh_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"user_id" uuid NOT NULL,
	"token_hash" varchar(64) NOT NULL UNIQUE,
	"expires_at" timestamp NOT NULL,
	"revoked_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_api_keys_key_hash" ON "api_keys" ("key_hash");--> statement-breakpoint
CREATE INDEX "idx_api_keys_project_id" ON "api_keys" ("project_id");--> statement-breakpoint
CREATE INDEX "idx_refresh_tokens_token_hash" ON "refresh_tokens" ("token_hash");--> statement-breakpoint
CREATE INDEX "idx_refresh_tokens_user_id" ON "refresh_tokens" ("user_id");--> statement-breakpoint
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;