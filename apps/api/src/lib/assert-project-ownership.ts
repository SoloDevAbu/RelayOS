import { eq, and } from "drizzle-orm";
import { projects } from "@relayos/db/schema";
import type { FastifyRequest, FastifyReply } from "fastify";

/**
 * Confirms the project exists and belongs to the authenticated user.
 * Sends 404 and returns false if not — callers must guard with `if (!owned) return`.
 */
export async function assertProjectOwnership(
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
