import fp from "fastify-plugin";
import fastifyRateLimit from "@fastify/rate-limit";
import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import { redis } from "@relayos/lib/redis";

/**
 * Global rate limiting — 100 requests/min per IP, backed by Redis for
 * distributed correctness across multiple instances.
 */
const rateLimitPlugin: FastifyPluginAsync = async (fastify) => {
  await fastify.register(fastifyRateLimit, {
    max: 100,
    timeWindow: "1 minute",
    // Use shared Redis instance from @relayos/lib
    redis,
    nameSpace: "relayos-api-rl:",
    keyGenerator: (request: FastifyRequest) => {
      // If authenticated, rate-limit per user; otherwise per IP
      return (request.user as { id?: string } | undefined)?.id ?? request.ip;
    },
    errorResponseBuilder: (_request, context) => ({
      statusCode: 429,
      error: "Too Many Requests",
      message: `Rate limit exceeded. Retry after ${context.after}`,
      retryAfter: context.after,
    }),
  });

  // Disable rate limiting for health endpoint via a global onRequest hook
  fastify.addHook("onRequest", async (request, reply) => {
    if (request.url === "/health" || request.url === "/api/v1/health") {
      // @ts-expect-error — accessing internal rate limit context to skip
      request.rateLimit = false;
    }
  });
};

export default fp(rateLimitPlugin, {
  name: "rate-limit",
  fastify: "5.x",
  dependencies: ["config"],
});
