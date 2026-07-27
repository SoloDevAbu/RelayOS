import type { FastifyPluginAsync } from "fastify";
import healthRoute from "./health/index.js";
import authRoutes from "./auth/index.js";
import projectRoutes from "./projects/index.js";
import apiKeyRoutes from "./api-keys/index.js";
import workflowRoutes from "./workflows/index.js";

const routes: FastifyPluginAsync = async (fastify) => {
  // Public
  fastify.register(healthRoute);

  // Auth (public endpoints with tighter rate limit)
  fastify.register(authRoutes, { prefix: "/auth" });

  // Protected resources
  fastify.register(projectRoutes, { prefix: "/projects" });
  fastify.register(apiKeyRoutes, {
    prefix: "/projects/:projectId/api-keys",
  });
  fastify.register(workflowRoutes, {
    prefix: "/projects/:projectId/workflows",
  });
};

export default routes;
