import type { FastifyPluginAsync } from "fastify";
import triggerRoutes from "./trigger/index.js";

const routes: FastifyPluginAsync = async (fastify) => {
  fastify.register(triggerRoutes, { prefix: "/trigger" });
};

export default routes;
