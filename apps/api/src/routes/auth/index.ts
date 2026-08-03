import type { FastifyPluginAsync } from "fastify";
import fastifyRateLimit from "@fastify/rate-limit";
import { redis } from "@relayos/lib/redis";
import { signup, signin, refresh, logout } from "./handlers.js";
import {
  signupSchema,
  signinSchema,
  refreshSchema,
  logoutSchema,
} from "../../schemas/auth.js";

/**
 * Auth routes
 * Stricter rate limit (10 req/min) applied to the entire encapsulated plugin.
 */
const authRoutes: FastifyPluginAsync = async (fastify) => {
  await fastify.register(fastifyRateLimit, {
    max: 10,
    timeWindow: "1 minute",
    redis,
    nameSpace: "relayos-auth-rl:",
    keyGenerator: (request) => {
      // Rate limit by IP + email combo to prevent credential-stuffing
      const body = request.body as { email?: string } | undefined;
      return `${request.ip}:${body?.email ?? ""}`;
    },
    errorResponseBuilder: (_req, ctx) => ({
      statusCode: 429,
      error: "Too Many Requests",
      message: `Too many auth attempts. Retry after ${ctx.after}`,
      retryAfter: ctx.after,
    }),
  });

  fastify.post("/signup", { schema: signupSchema }, signup);
  fastify.post("/signin", { schema: signinSchema }, signin);
  fastify.post("/refresh", { schema: refreshSchema }, refresh);
  fastify.post("/logout", { schema: logoutSchema }, logout);
};

export default authRoutes;
