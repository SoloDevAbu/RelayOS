import {
  pgTable,
  pgEnum,
  uuid,
  varchar,
  text,
  integer,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { projects } from "./auth";
import { executions } from "./workflow";

export const invocationTypeEnum = pgEnum("invocation_type", [
  "LOCAL",
  "WEBHOOK",
]);

export const authTypeEnum = pgEnum("auth_type", [
  "NONE",
  "BEARER",
  "API_KEY_HEADER",
  "BASIC",
]);

export const toolExecStatusEnum = pgEnum("tool_exec_status", [
  "SUCCESS",
  "FAILED",
  "TIMEOUT",
]);

export const toolDefinitions = pgTable(
  "tool_definitions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id")
      .references(() => projects.id, { onDelete: "cascade" })
      .notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    description: text("description").notNull(),
    inputSchema: jsonb("input_schema").notNull(),
    outputSchema: jsonb("output_schema"),
    invocationType: invocationTypeEnum("invocation_type").notNull(),
    url: text("url"),
    httpMethod: varchar("http_method", { length: 10 })
      .default("POST")
      .notNull(),
    timeoutMs: integer("timeout_ms").default(30000).notNull(),
    authType: authTypeEnum("auth_type").default("NONE").notNull(),
    authHeaderName: varchar("auth_header_name", { length: 255 }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    projectIdx: index("idx_tool_definitions_project_id").on(t.projectId),
    projectNameIdx: uniqueIndex("idx_tool_definitions_project_name").on(
      t.projectId,
      t.name,
    ),
  }),
);

export const toolCredentials = pgTable("tool_credentials", {
  id: uuid("id").defaultRandom().primaryKey(),
  toolId: uuid("tool_id")
    .references(() => toolDefinitions.id, { onDelete: "cascade" })
    .notNull()
    .unique(),
  encryptedValue: text("encrypted_value").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const toolExecutions = pgTable(
  "tool_executions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    executionId: uuid("execution_id")
      .references(() => executions.id, { onDelete: "cascade" })
      .notNull(),
    stepId: varchar("step_id", { length: 255 }).notNull(),
    toolId: uuid("tool_id")
      .references(() => toolDefinitions.id)
      .notNull(),
    input: jsonb("input").notNull(),
    output: jsonb("output"),
    status: toolExecStatusEnum("status").notNull(),
    durationMs: integer("duration_ms"),
    error: text("error"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    executionIdx: index("idx_tool_executions_execution_id").on(t.executionId),
    toolIdx: index("idx_tool_executions_tool_id").on(t.toolId),
  }),
);
