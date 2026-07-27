import { randomBytes, createHash } from "node:crypto";
import { eq, and, isNull } from "drizzle-orm";
import { projects, apiKeys } from "@relayos/db/schema";
import type { FastifyRequest, FastifyReply } from "fastify";
import type { CreateApiKeyBodyType, ApiKeyParamsType } from "./schemas.js";

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/**
 * Verify the project exists and belongs to the authenticated user.
 */
async function assertProjectOwnership(
  request: FastifyRequest,
  reply: FastifyReply,
  projectId: string,
): Promise<boolean> {
  const [project] = await request.server.db
    .select({ id: projects.id })
    .from(projects)
    .where(
      and(eq(projects.id, projectId), eq(projects.userId, request.user!.id)),
    )
    .limit(1);

  if (!project) {
    await reply.notFound("Project not found");
    return false;
  }

  return true;
}

export async function createApiKey(
  request: FastifyRequest<{
    Params: { projectId: string };
    Body: CreateApiKeyBodyType;
  }>,
  reply: FastifyReply,
) {
  const { projectId } = request.params;
  const { name } = request.body;
  const fastify = request.server;

  const owned = await assertProjectOwnership(request, reply, projectId);
  if (!owned) return;

  // Generate raw key — shown once to the user
  const rawKey = randomBytes(32).toString("hex"); // 64 hex chars
  const keyHash = sha256(rawKey);
  const keyPrefix = `relay_${rawKey.slice(0, 8)}`;
  // Full key returned to user: relay_<rawKey>
  const fullKey = `relay_${rawKey}`;

  const rows = await fastify.db
    .insert(apiKeys)
    .values({
      projectId,
      name,
      keyHash,
      keyPrefix,
    })
    .returning({
      id: apiKeys.id,
      name: apiKeys.name,
      keyPrefix: apiKeys.keyPrefix,
      createdAt: apiKeys.createdAt,
    });

  const key = rows[0];
  if (!key) throw new Error("Failed to create API key");

  reply.code(201);
  return {
    id: key.id,
    name: key.name,
    keyPrefix: key.keyPrefix,
    key: fullKey,
    createdAt: key.createdAt.toISOString(),
  };
}

export async function listApiKeys(
  request: FastifyRequest<{ Params: { projectId: string } }>,
  reply: FastifyReply,
) {
  const { projectId } = request.params;
  const fastify = request.server;

  const owned = await assertProjectOwnership(request, reply, projectId);
  if (!owned) return;

  const rows = await fastify.db
    .select({
      id: apiKeys.id,
      name: apiKeys.name,
      keyPrefix: apiKeys.keyPrefix,
      lastUsedAt: apiKeys.lastUsedAt,
      revokedAt: apiKeys.revokedAt,
      createdAt: apiKeys.createdAt,
    })
    .from(apiKeys)
    .where(eq(apiKeys.projectId, projectId));

  return {
    apiKeys: rows.map((k) => ({
      id: k.id,
      name: k.name,
      keyPrefix: k.keyPrefix,
      lastUsedAt: k.lastUsedAt?.toISOString() ?? null,
      revokedAt: k.revokedAt?.toISOString() ?? null,
      createdAt: k.createdAt.toISOString(),
    })),
    total: rows.length,
  };
}

export async function revokeApiKey(
  request: FastifyRequest<{ Params: ApiKeyParamsType }>,
  reply: FastifyReply,
) {
  const { projectId, keyId } = request.params;
  const fastify = request.server;

  const owned = await assertProjectOwnership(request, reply, projectId);
  if (!owned) return;

  // Verify the key belongs to this project and is not already revoked
  const [key] = await fastify.db
    .select({ id: apiKeys.id })
    .from(apiKeys)
    .where(
      and(
        eq(apiKeys.id, keyId),
        eq(apiKeys.projectId, projectId),
        isNull(apiKeys.revokedAt),
      ),
    )
    .limit(1);

  if (!key) {
    return reply.notFound("API key not found or already revoked");
  }

  await fastify.db
    .update(apiKeys)
    .set({ revokedAt: new Date() })
    .where(eq(apiKeys.id, key.id));

  return { message: "API key revoked successfully" };
}
