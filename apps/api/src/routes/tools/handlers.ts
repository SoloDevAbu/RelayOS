import { eq, and, count, inArray } from "drizzle-orm";
import Ajv from "ajv";
import addFormats from "ajv-formats";
import { toolDefinitions, toolCredentials } from "@relayos/db/schema";
import { encrypt } from "@relayos/lib/crypto";
import type { FastifyRequest, FastifyReply } from "fastify";
import type {
  CreateToolBodyType,
  UpdateToolBodyType,
  ToolParamsType,
  PaginationQueryType,
  ToolResponseType,
} from "../../schemas/tools.js";
import { DEFAULT_PAGE, DEFAULT_LIMIT } from "../../constants/index.js";
import { assertProjectOwnership } from "../../lib/assert-project-ownership.js";

const MAX_TIMEOUT_MS = 30_000;

const ajv = new Ajv({ strict: false });
addFormats(ajv);

function validateJsonSchema(schema: Record<string, unknown>): void {
  try {
    ajv.compile(schema);
  } catch {
    throw Object.assign(new Error("inputSchema is not a valid JSON Schema"), {
      statusCode: 400,
    });
  }
}

function requireHttpsUrl(url: string | undefined): void {
  if (!url || !url.startsWith("https://")) {
    throw Object.assign(
      new Error(
        "url is required for WEBHOOK tools and must use https:// — plain HTTP is rejected at registration time",
      ),
      { statusCode: 400 },
    );
  }
}

function getMasterKey(request: FastifyRequest): string {
  return request.server.config.ENCRYPTION_MASTER_KEY;
}

function mapTool(
  tool: typeof toolDefinitions.$inferSelect,
  hasCredential: boolean,
): ToolResponseType {
  return {
    id: tool.id,
    projectId: tool.projectId,
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
    outputSchema: tool.outputSchema ?? null,
    invocationType: tool.invocationType,
    url: tool.url ?? null,
    httpMethod: tool.httpMethod,
    timeoutMs: tool.timeoutMs,
    authType: tool.authType,
    authHeaderName: tool.authHeaderName ?? null,
    hasCredential,
    createdAt: tool.createdAt.toISOString(),
    updatedAt: tool.updatedAt.toISOString(),
  };
}

async function getHasCredential(
  fastify: FastifyRequest["server"],
  toolId: string,
): Promise<boolean> {
  const [row] = await fastify.db
    .select({ id: toolCredentials.id })
    .from(toolCredentials)
    .where(eq(toolCredentials.toolId, toolId))
    .limit(1);
  return row !== undefined;
}

export async function createTool(
  request: FastifyRequest<{
    Params: { projectId: string };
    Body: CreateToolBodyType;
  }>,
  reply: FastifyReply,
) {
  const { projectId } = request.params;
  const body = request.body;
  const fastify = request.server;

  const owned = await assertProjectOwnership(request, reply, projectId);
  if (!owned) return;

  if (body.invocationType === "WEBHOOK") {
    requireHttpsUrl(body.url);
  }

  validateJsonSchema(body.inputSchema);

  if (body.outputSchema) {
    validateJsonSchema(body.outputSchema as Record<string, unknown>);
  }

  const [inserted] = await fastify.db
    .insert(toolDefinitions)
    .values({
      projectId,
      name: body.name,
      description: body.description,
      inputSchema: body.inputSchema,
      outputSchema: body.outputSchema ?? null,
      invocationType: body.invocationType,
      url: body.url ?? null,
      httpMethod: body.httpMethod ?? "POST",
      timeoutMs: Math.min(body.timeoutMs ?? 30000, MAX_TIMEOUT_MS),
      authType: body.authType ?? "NONE",
      authHeaderName: body.authHeaderName ?? null,
    })
    .returning();

  if (!inserted) throw new Error("Failed to create tool");

  if (body.credential) {
    const encryptedValue = encrypt(body.credential, getMasterKey(request));
    await fastify.db.insert(toolCredentials).values({
      toolId: inserted.id,
      encryptedValue,
    });
  }

  const hasCredential = body.credential !== undefined;
  reply.code(201);
  return mapTool(inserted, hasCredential);
}

export async function listTools(
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
      .from(toolDefinitions)
      .where(eq(toolDefinitions.projectId, projectId))
      .limit(limit)
      .offset(offset),
    fastify.db
      .select({ total: count() })
      .from(toolDefinitions)
      .where(eq(toolDefinitions.projectId, projectId)),
  ]);

  const toolIds = rows.map((r) => r.id);
  const credRows = toolIds.length
    ? await fastify.db
        .select({ toolId: toolCredentials.toolId })
        .from(toolCredentials)
        .where(inArray(toolCredentials.toolId, toolIds))
    : [];

  const credSet = new Set(credRows.map((r) => r.toolId));

  const totalRow = countRows[0];
  const total = totalRow ? Number(totalRow.total) : 0;

  return {
    tools: rows.map((t) => mapTool(t, credSet.has(t.id))),
    total,
    page,
    limit,
  };
}

export async function getTool(
  request: FastifyRequest<{ Params: ToolParamsType }>,
  reply: FastifyReply,
) {
  const { projectId, toolId } = request.params;
  const fastify = request.server;

  const owned = await assertProjectOwnership(request, reply, projectId);
  if (!owned) return;

  const [tool] = await fastify.db
    .select()
    .from(toolDefinitions)
    .where(
      and(
        eq(toolDefinitions.id, toolId),
        eq(toolDefinitions.projectId, projectId),
      ),
    )
    .limit(1);

  if (!tool) return reply.notFound("Tool not found");

  const hasCredential = await getHasCredential(fastify, toolId);
  return mapTool(tool, hasCredential);
}

export async function updateTool(
  request: FastifyRequest<{
    Params: ToolParamsType;
    Body: UpdateToolBodyType;
  }>,
  reply: FastifyReply,
) {
  const { projectId, toolId } = request.params;
  const body = request.body;
  const fastify = request.server;

  const owned = await assertProjectOwnership(request, reply, projectId);
  if (!owned) return;

  const [existing] = await fastify.db
    .select()
    .from(toolDefinitions)
    .where(
      and(
        eq(toolDefinitions.id, toolId),
        eq(toolDefinitions.projectId, projectId),
      ),
    )
    .limit(1);

  if (!existing) return reply.notFound("Tool not found");

  const newInvocationType = existing.invocationType;
  const newUrl = body.url ?? existing.url;

  if (newInvocationType === "WEBHOOK") {
    requireHttpsUrl(newUrl ?? undefined);
  }

  if (body.inputSchema) {
    validateJsonSchema(body.inputSchema as Record<string, unknown>);
  }

  if (body.outputSchema) {
    validateJsonSchema(body.outputSchema as Record<string, unknown>);
  }

  const updates: Partial<typeof toolDefinitions.$inferInsert> = {
    updatedAt: new Date(),
  };

  if (body.name !== undefined) updates.name = body.name;
  if (body.description !== undefined) updates.description = body.description;
  if (body.inputSchema !== undefined)
    updates.inputSchema = body.inputSchema;
  if (body.outputSchema !== undefined)
    updates.outputSchema = body.outputSchema ?? null;
  if (body.url !== undefined) updates.url = body.url;
  if (body.httpMethod !== undefined) updates.httpMethod = body.httpMethod;
  if (body.timeoutMs !== undefined)
    updates.timeoutMs = Math.min(body.timeoutMs, MAX_TIMEOUT_MS);
  if (body.authType !== undefined) updates.authType = body.authType;
  if (body.authHeaderName !== undefined)
    updates.authHeaderName = body.authHeaderName;

  const [updated] = await fastify.db
    .update(toolDefinitions)
    .set(updates)
    .where(eq(toolDefinitions.id, toolId))
    .returning();

  if (!updated) throw new Error("Failed to update tool");

  if (body.credential) {
    const encryptedValue = encrypt(body.credential, getMasterKey(request));
    await fastify.db
      .insert(toolCredentials)
      .values({ toolId, encryptedValue })
      .onConflictDoUpdate({
        target: toolCredentials.toolId,
        set: { encryptedValue, createdAt: new Date() },
      });
  }

  const hasCredential = await getHasCredential(fastify, toolId);
  return mapTool(updated, hasCredential);
}

export async function deleteTool(
  request: FastifyRequest<{ Params: ToolParamsType }>,
  reply: FastifyReply,
) {
  const { projectId, toolId } = request.params;
  const fastify = request.server;

  const owned = await assertProjectOwnership(request, reply, projectId);
  if (!owned) return;

  const [existing] = await fastify.db
    .select({ id: toolDefinitions.id })
    .from(toolDefinitions)
    .where(
      and(
        eq(toolDefinitions.id, toolId),
        eq(toolDefinitions.projectId, projectId),
      ),
    )
    .limit(1);

  if (!existing) return reply.notFound("Tool not found");

  await fastify.db
    .delete(toolDefinitions)
    .where(eq(toolDefinitions.id, toolId));

  return { message: "Tool deleted successfully" };
}

