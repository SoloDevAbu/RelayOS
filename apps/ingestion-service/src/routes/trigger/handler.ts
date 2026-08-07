import { createHash } from "node:crypto";
import { eq, and } from "drizzle-orm";
import { workflows } from "@relayos/db/schema";
import { lookupApiKey } from "../../services/api-key-lookup.js";
import { insertAndEnqueue } from "../../services/enqueue-execution.js";
import type { FastifyRequest, FastifyReply } from "fastify";

const API_KEY_PREFIX = "relay_";

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export interface TriggerBody {
  workflowId: string;
  payload?: Record<string, unknown>;
}

export async function triggerHandler(
  request: FastifyRequest<{ Body: TriggerBody }>,
  reply: FastifyReply,
) {
  const { db, redis } = request.server;

  const authHeader = request.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return reply.code(401).send({
      statusCode: 401,
      error: "Unauthorized",
      message: "Missing or malformed Authorization header",
    });
  }

  const token = authHeader.slice(7);
  if (!token.startsWith(API_KEY_PREFIX)) {
    return reply.code(401).send({
      statusCode: 401,
      error: "Unauthorized",
      message: "Invalid API key format",
    });
  }

  const rawKey = token.slice(API_KEY_PREFIX.length);
  const keyHash = sha256(rawKey);
  const apiKeyRecord = await lookupApiKey(keyHash, db, redis);

  if (!apiKeyRecord) {
    return reply.code(401).send({
      statusCode: 401,
      error: "Unauthorized",
      message: "Invalid or revoked API key",
    });
  }

  const { projectId } = apiKeyRecord;
  const { workflowId, payload } = request.body;

  const [workflow] = await db
    .select({ id: workflows.id })
    .from(workflows)
    .where(
      and(
        eq(workflows.id, workflowId),
        eq(workflows.projectId, projectId),
        eq(workflows.status, "ACTIVE"),
      ),
    )
    .limit(1);

  if (!workflow) {
    return reply.code(404).send({
      statusCode: 404,
      error: "Not Found",
      message: "Workflow not found or not active",
    });
  }

  const executionId = await insertAndEnqueue(
    { workflowId, projectId, payload },
    db,
  );

  return reply.code(202).send({ executionId, status: "PENDING" });
}
