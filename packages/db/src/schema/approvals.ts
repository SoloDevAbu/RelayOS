import {
  pgTable,
  pgEnum,
  uuid,
  varchar,
  text,
  timestamp,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import { executions } from "./workflow";
import { users } from "./auth";

export const approvalStatusEnum = pgEnum("approval_status", [
  "PENDING",
  "APPROVED",
  "REJECTED",
]);

export const approvals = pgTable(
  "approvals",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    executionId: uuid("execution_id")
      .references(() => executions.id, { onDelete: "cascade" })
      .notNull(),
    stepId: varchar("step_id", { length: 255 }).notNull(),
    prompt: text("prompt").notNull(),
    context: jsonb("context"), // relevant data for the approver to see
    status: approvalStatusEnum("status").default("PENDING").notNull(),
    approvedBy: uuid("approved_by").references(() => users.id),
    approvedAt: timestamp("approved_at"),
    comment: text("comment"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    executionIdx: index("idx_approvals_execution_id").on(t.executionId),
    statusIdx: index("idx_approvals_status").on(t.status),
  }),
);
