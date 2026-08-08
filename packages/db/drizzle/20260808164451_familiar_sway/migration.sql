ALTER INDEX "idx_execution_steps_step_id" RENAME TO "idx_execution_steps_step_attempt";--> statement-breakpoint
DROP INDEX "idx_execution_steps_step_attempt";--> statement-breakpoint
CREATE UNIQUE INDEX "idx_execution_steps_step_attempt" ON "execution_steps" ("execution_id","step_id","attempt");