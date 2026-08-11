import type { FastifyPluginAsync } from "fastify";
import { planRouteSchema, type PlanRequest } from "../schemas/plan.js";
import { plan } from "../services/planning-service.js";

const planRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post<{ Body: PlanRequest }>(
    "/plan",
    { schema: planRouteSchema },
    async (request, reply) => {
      const result = await plan(request.body, request.log);
      return reply.send(result);
    },
  );
};

export default planRoute;
