import fp from "fastify-plugin";
import fastifyRateLimit from "@fastify/rate-limit";
import type { FastifyPluginAsync } from "fastify";
import { redis } from "@relayos/lib/redis";

const rateLimitPlugin: FastifyPluginAsync = async (fastify) => {
  await fastify.register(fastifyRateLimit, {
    max: 100,
    timeWindow: "1 minute",
    redis,
    nameSpace: "relayos-ingestion-rl:",
    keyGenerator: (request) => request.ip,
    errorResponseBuilder: (_request, context) => ({
      statusCode: 429,
      error: "Too Many Requests",
      message: `Rate limit exceeded. Retry after ${context.after}`,
      retryAfter: context.after,
    }),
  });
};

export default fp(rateLimitPlugin, {
  name: "rate-limit",
  fastify: "5.x",
});
