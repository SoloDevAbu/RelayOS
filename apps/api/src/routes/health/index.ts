import type { FastifyPluginAsync } from "fastify";

/**
 * GET /health
 * Public endpoint — no auth, no rate limit.
 */
const healthRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get(
    "/health",
    {
      schema: {
        description: "Health check",
        tags: ["health"],
        response: {
          200: {
            type: "object",
            properties: {
              status: { type: "string" },
              uptime: { type: "number" },
              timestamp: { type: "string", format: "date-time" },
            },
          },
        },
      },
      config: {
        rateLimit: false,
      },
    },
    async () => ({
      status: "ok",
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    }),
  );
};

export default healthRoute;
