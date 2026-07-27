import fp from "fastify-plugin";
import fastifyHelmet from "@fastify/helmet";
import type { FastifyPluginAsync } from "fastify";

/**
 * Helmet security headers — CSP disabled since this is a pure JSON API.
 * Adds: X-Frame-Options, X-Content-Type-Options, Referrer-Policy, HSTS, etc.
 */
const helmetPlugin: FastifyPluginAsync = async (fastify) => {
  await fastify.register(fastifyHelmet, {
    contentSecurityPolicy: false, // Not needed for a pure API
    crossOriginEmbedderPolicy: false,
  });
};

export default fp(helmetPlugin, {
  name: "helmet",
  fastify: "5.x",
});
