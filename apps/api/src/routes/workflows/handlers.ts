import { eq, and, count } from "drizzle-orm";
import { workflows } from "@relayos/db/schema";
import type { FastifyRequest, FastifyReply } from "fastify";
import type {
  CreateWorkflowBodyType,
  UpdateWorkflowBodyType,
  WorkflowParamsType,
  PaginationQueryType,
} from "../../schemas/workflows.js";
import { DEFAULT_PAGE, DEFAULT_LIMIT } from "../../constants/index.js";
import { assertProjectOwnership } from "../../lib/assert-project-ownership.js";

interface MappedWorkflow {
  id: string;
  projectId: string;
  name: string;
  description: string | null;
  definition: unknown;
  triggerType: "MANUAL" | "SCHEDULED" | "EVENT";
  status: "DRAFT" | "ACTIVE" | "INACTIVE";
  version: number;
  createdAt: string;
  updatedAt: string;
}

function mapWorkflow(w: typeof workflows.$inferSelect): MappedWorkflow {
  return {
    id: w.id,
    projectId: w.projectId,
    name: w.name,
    description: w.description,
    definition: w.definition,
    triggerType: w.triggerType,
    status: w.status,
    version: w.version,
    createdAt: w.createdAt.toISOString(),
    updatedAt: w.updatedAt.toISOString(),
  };
}

export async function createWorkflow(
  request: FastifyRequest<{
    Params: { projectId: string };
    Body: CreateWorkflowBodyType;
  }>,
  reply: FastifyReply,
) {
  const { projectId } = request.params;
  const { name, description, definition, triggerType } = request.body;
  const fastify = request.server;

  const owned = await assertProjectOwnership(request, reply, projectId);
  if (!owned) return;

  const inserted = await fastify.db
    .insert(workflows)
    .values({
      projectId,
      name,
      description: description ?? null,
      definition,
      triggerType,
    })
    .returning();

  const workflow = inserted[0];
  if (!workflow) throw new Error("Failed to create workflow");

  reply.code(201);
  return mapWorkflow(workflow);
}

export async function listWorkflows(
  request: FastifyRequest<{
    Params: { projectId: string };
    Querystring: PaginationQueryType;
  }>,
  reply: FastifyReply,
) {
  const { projectId } = request.params;
  const page = request.query.page ?? DEFAULT_PAGE;
  const limit = request.query.limit ?? DEFAULT_LIMIT;
  const offset = (page - 1) * limit;
  const fastify = request.server;

  const owned = await assertProjectOwnership(request, reply, projectId);
  if (!owned) return;

  const [rows, countRows] = await Promise.all([
    fastify.db
      .select()
      .from(workflows)
      .where(eq(workflows.projectId, projectId))
      .limit(limit)
      .offset(offset),
    fastify.db
      .select({ total: count() })
      .from(workflows)
      .where(eq(workflows.projectId, projectId)),
  ]);

  const totalRow = countRows[0];
  const total = totalRow ? Number(totalRow.total) : 0;

  return {
    workflows: rows.map(mapWorkflow),
    total,
    page,
    limit,
  };
}

export async function getWorkflow(
  request: FastifyRequest<{ Params: WorkflowParamsType }>,
  reply: FastifyReply,
) {
  const { projectId, workflowId } = request.params;
  const fastify = request.server;

  const owned = await assertProjectOwnership(request, reply, projectId);
  if (!owned) return;

  const [workflow] = await fastify.db
    .select()
    .from(workflows)
    .where(
      and(eq(workflows.id, workflowId), eq(workflows.projectId, projectId)),
    )
    .limit(1);

  if (!workflow) {
    return reply.notFound("Workflow not found");
  }

  return mapWorkflow(workflow);
}

export async function updateWorkflow(
  request: FastifyRequest<{
    Params: WorkflowParamsType;
    Body: UpdateWorkflowBodyType;
  }>,
  reply: FastifyReply,
) {
  const { projectId, workflowId } = request.params;
  const fastify = request.server;

  const owned = await assertProjectOwnership(request, reply, projectId);
  if (!owned) return;

  const [existing] = await fastify.db
    .select()
    .from(workflows)
    .where(
      and(eq(workflows.id, workflowId), eq(workflows.projectId, projectId)),
    )
    .limit(1);

  if (!existing) {
    return reply.notFound("Workflow not found");
  }

  const updates: Partial<typeof workflows.$inferInsert> = {
    updatedAt: new Date(),
  };

  if (request.body.name !== undefined) updates.name = request.body.name;
  if (request.body.description !== undefined)
    updates.description = request.body.description;
  if (request.body.definition !== undefined) {
    updates.definition = request.body.definition;
    // Bump version on definition change
    updates.version = existing.version + 1;
  }
  if (request.body.triggerType !== undefined)
    updates.triggerType = request.body.triggerType;

  const updatedRows = await fastify.db
    .update(workflows)
    .set(updates)
    .where(eq(workflows.id, workflowId))
    .returning();

  const updated = updatedRows[0];
  if (!updated) throw new Error("Failed to update workflow");

  return mapWorkflow(updated);
}

export async function deleteWorkflow(
  request: FastifyRequest<{ Params: WorkflowParamsType }>,
  reply: FastifyReply,
) {
  const { projectId, workflowId } = request.params;
  const fastify = request.server;

  const owned = await assertProjectOwnership(request, reply, projectId);
  if (!owned) return;

  const [existing] = await fastify.db
    .select({ id: workflows.id })
    .from(workflows)
    .where(
      and(eq(workflows.id, workflowId), eq(workflows.projectId, projectId)),
    )
    .limit(1);

  if (!existing) {
    return reply.notFound("Workflow not found");
  }

  await fastify.db.delete(workflows).where(eq(workflows.id, workflowId));
  return { message: "Workflow deleted successfully" };
}

export async function activateWorkflow(
  request: FastifyRequest<{ Params: WorkflowParamsType }>,
  reply: FastifyReply,
) {
  const { projectId, workflowId } = request.params;
  const fastify = request.server;

  const owned = await assertProjectOwnership(request, reply, projectId);
  if (!owned) return;

  const updatedRows = await fastify.db
    .update(workflows)
    .set({ status: "ACTIVE", updatedAt: new Date() })
    .where(
      and(eq(workflows.id, workflowId), eq(workflows.projectId, projectId)),
    )
    .returning();

  const workflow = updatedRows[0];
  if (!workflow) {
    return reply.notFound("Workflow not found");
  }

  return mapWorkflow(workflow);
}

export async function deactivateWorkflow(
  request: FastifyRequest<{ Params: WorkflowParamsType }>,
  reply: FastifyReply,
) {
  const { projectId, workflowId } = request.params;
  const fastify = request.server;

  const owned = await assertProjectOwnership(request, reply, projectId);
  if (!owned) return;

  const updatedRows = await fastify.db
    .update(workflows)
    .set({ status: "INACTIVE", updatedAt: new Date() })
    .where(
      and(eq(workflows.id, workflowId), eq(workflows.projectId, projectId)),
    )
    .returning();

  const workflow = updatedRows[0];
  if (!workflow) {
    return reply.notFound("Workflow not found");
  }

  return mapWorkflow(workflow);
}
