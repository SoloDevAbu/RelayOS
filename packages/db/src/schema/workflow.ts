import {
  pgTable,
  pgEnum,
  uuid,
  varchar,
  text,
  integer,
  timestamp,
  jsonb,
  boolean,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { projects } from "./auth";

export const workflowStatusEnum = pgEnum("workflow_status", [
  "DRAFT",
  "ACTIVE",
  "INACTIVE",
]);
export const triggerTypeEnum = pgEnum("trigger_type", [
  "MANUAL",
  "SCHEDULED",
  "EVENT",
]);
export const executionStatusEnum = pgEnum("execution_status", [
  "PENDING",
  "RUNNING",
  "COMPLETED",
  "FAILED",
  "CANCELLED",
  "WAITING_APPROVAL",
]);
export const stepStatusEnum = pgEnum("step_status", [
  "PENDING",
  "RUNNING",
  "COMPLETED",
  "FAILED",
  "WAITING_APPROVAL",
  "CANCELLED",
  "SKIPPED",
  "EXHAUSTED",
]);
export const stepTypeEnum = pgEnum("step_type", [
  "AI_PLAN",
  "TOOL_CALL",
  "APPROVAL",
  "CONDITION",
  "TRANSFORM",
  "DELAY",
]);
export const compensationStatusEnum = pgEnum("compensation_status", [
  "PENDING",
  "RUNNING",
  "COMPLETED",
  "FAILED",
]);
export const sagaStatusEnum = pgEnum("saga_status", [
  "COMPENSATING",
  "COMPENSATED",
  "COMPENSATION_FAILED",
]);

export const workflows = pgTable(
  "workflows",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id")
      .references(() => projects.id, { onDelete: "cascade" })
      .notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    description: text("description"),
    definition: jsonb("definition").notNull(), // WorkflowDefinition
    triggerType: triggerTypeEnum("trigger_type").notNull(),
    status: workflowStatusEnum("status").default("DRAFT").notNull(),
    version: integer("version").default(1).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    projectIdx: index("idx_workflows_project_id").on(t.projectId),
  }),
);

export const executions = pgTable(
  "executions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workflowId: uuid("workflow_id")
      .references(() => workflows.id)
      .notNull(),
    projectId: uuid("project_id")
      .references(() => projects.id)
      .notNull(),
    triggerPayload: jsonb("trigger_payload"),
    status: executionStatusEnum("status").default("PENDING").notNull(),
    currentStepId: varchar("current_step_id", { length: 255 }),
    correlationId: varchar("correlation_id", { length: 36 }),
    startedAt: timestamp("started_at"),
    completedAt: timestamp("completed_at"),
    error: text("error"),
    isSaga: boolean("is_saga").default(false).notNull(),
    sagaStatus: sagaStatusEnum("saga_status"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    workflowIdx: index("idx_executions_workflow_id").on(t.workflowId),
    projectIdx: index("idx_executions_project_id").on(t.projectId),
    statusIdx: index("idx_executions_status").on(t.status),
    createdAtIdx: index("idx_executions_created_at").on(t.createdAt),
  }),
);

export const executionSteps = pgTable(
  "execution_steps",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    executionId: uuid("execution_id")
      .references(() => executions.id, { onDelete: "cascade" })
      .notNull(),
    stepId: varchar("step_id", { length: 255 }).notNull(),
    stepType: stepTypeEnum("step_type").notNull(),
    status: stepStatusEnum("status").default("PENDING").notNull(),
    input: jsonb("input"),
    output: jsonb("output"),
    error: text("error"),
    attempt: integer("attempt").default(1).notNull(),
    maxAttempts: integer("max_attempts").default(3).notNull(),
    startedAt: timestamp("started_at"),
    completedAt: timestamp("completed_at"),
    compensationStatus: compensationStatusEnum("compensation_status"),
    compensationInput: jsonb("compensation_input"),
    compensationOutput: jsonb("compensation_output"),
    compensatedAt: timestamp("compensated_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    executionIdx: index("idx_execution_steps_execution_id").on(t.executionId),
    executionStepAttemptIdx: uniqueIndex("idx_execution_steps_step_attempt").on(
      t.executionId,
      t.stepId,
      t.attempt,
    ),
  }),
);

export const schedules = pgTable(
  "schedules",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workflowId: uuid("workflow_id")
      .references(() => workflows.id, { onDelete: "cascade" })
      .notNull(),
    cronExpression: varchar("cron_expression", { length: 255 }).notNull(),
    timezone: varchar("timezone", { length: 100 }).default("UTC").notNull(),
    enabled: boolean("enabled").default(true).notNull(),
    nextRunAt: timestamp("next_run_at").notNull(),
    lastRunAt: timestamp("last_run_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    nextRunIdx: index("idx_schedules_next_run_at").on(t.nextRunAt),
  }),
);
