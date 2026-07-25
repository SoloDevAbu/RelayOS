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
} from "drizzle-orm/pg-core";
import { projects } from "./auth";
import { executions } from "./workflow";

export const executorTypeEnum = pgEnum("executor_type", [
  "HTTP",
  "BUILT_IN",
  "SDK",
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
    inputSchema: jsonb("input_schema").notNull(), // JSON Schema (Ajv-compatible)
    outputSchema: jsonb("output_schema"), // optional, for documentation
    executorType: executorTypeEnum("executor_type").notNull(),
    executorConfig: jsonb("executor_config").notNull(), // { url, method, headers, bodyTemplate } for HTTP
    timeoutMs: integer("timeout_ms").default(30000).notNull(),
    enabled: boolean("enabled").default(true).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    projectIdx: index("idx_tool_definitions_project_id").on(t.projectId),
  }),
);

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
