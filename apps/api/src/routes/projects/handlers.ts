import { randomBytes } from "node:crypto";
import { eq, and } from "drizzle-orm";
import { projects } from "@relayos/db/schema";
import type { FastifyRequest, FastifyReply } from "fastify";
import type {
  CreateProjectBodyType,
  UpdateProjectBodyType,
  ProjectParamsType,
} from "../../schemas/projects.js";

/**
 * Generate a URL-safe slug from a project name.
 * e.g. "My Cool Project" → "my-cool-project-a3b9c1"
 */
function generateSlug(name: string): string {
  const base = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/[\s]+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80);

  const suffix = randomBytes(3).toString("hex"); // 6 chars
  return `${base}-${suffix}`;
}

async function getOwnedProject(
  request: FastifyRequest,
  reply: FastifyReply,
  projectId: string,
) {
  const fastify = request.server;
  const userId = request.user!.id;

  const [project] = await fastify.db
    .select()
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.userId, userId)))
    .limit(1);

  if (!project) {
    await reply.notFound("Project not found");
    return null;
  }

  return project;
}

function mapProject(p: typeof projects.$inferSelect) {
  return {
    id: p.id,
    userId: p.userId,
    name: p.name,
    slug: p.slug,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}

export async function createProject(
  request: FastifyRequest<{ Body: CreateProjectBodyType }>,
  reply: FastifyReply,
) {
  const { name } = request.body;
  const fastify = request.server;
  const userId = request.user!.id;
  const slug = generateSlug(name);

  const rows = await fastify.db
    .insert(projects)
    .values({ userId, name, slug })
    .returning();

  const project = rows[0];
  if (!project) throw new Error("Failed to create project");

  reply.code(201);
  return mapProject(project);
}

export async function listProjects(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const fastify = request.server;
  const userId = request.user!.id;

  const rows = await fastify.db
    .select()
    .from(projects)
    .where(eq(projects.userId, userId));

  return {
    projects: rows.map(mapProject),
    total: rows.length,
  };
}

export async function getProject(
  request: FastifyRequest<{ Params: ProjectParamsType }>,
  reply: FastifyReply,
) {
  const project = await getOwnedProject(
    request,
    reply,
    request.params.projectId,
  );
  if (!project) return;
  return mapProject(project);
}

export async function updateProject(
  request: FastifyRequest<{
    Params: ProjectParamsType;
    Body: UpdateProjectBodyType;
  }>,
  reply: FastifyReply,
) {
  const fastify = request.server;
  const project = await getOwnedProject(
    request,
    reply,
    request.params.projectId,
  );
  if (!project) return;

  const updatedRows = await fastify.db
    .update(projects)
    .set({ name: request.body.name, updatedAt: new Date() })
    .where(eq(projects.id, project.id))
    .returning();

  const updated = updatedRows[0];
  if (!updated) throw new Error("Failed to update project");

  return mapProject(updated);
}

export async function deleteProject(
  request: FastifyRequest<{ Params: ProjectParamsType }>,
  reply: FastifyReply,
) {
  const fastify = request.server;
  const project = await getOwnedProject(
    request,
    reply,
    request.params.projectId,
  );
  if (!project) return;

  await fastify.db.delete(projects).where(eq(projects.id, project.id));
  return { message: "Project deleted successfully" };
}
