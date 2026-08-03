import type { FastifyPluginAsync } from "fastify";
import {
  createProject,
  listProjects,
  getProject,
  updateProject,
  deleteProject,
} from "./handlers.js";
import {
  createProjectSchema,
  listProjectsSchema,
  getProjectSchema,
  updateProjectSchema,
  deleteProjectSchema,
} from "../../schemas/projects.js";

/**
 * Project routes
 * All routes require JWT authentication.
 */
const projectRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook("onRequest", fastify.authenticate);

  fastify.post("/", { schema: createProjectSchema }, createProject);
  fastify.get("/", { schema: listProjectsSchema }, listProjects);
  fastify.get("/:projectId", { schema: getProjectSchema }, getProject);
  fastify.patch("/:projectId", { schema: updateProjectSchema }, updateProject);
  fastify.delete("/:projectId", { schema: deleteProjectSchema }, deleteProject);
};

export default projectRoutes;
