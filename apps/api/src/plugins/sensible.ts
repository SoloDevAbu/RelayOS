import fp from "fastify-plugin";
import fastifySensible from "@fastify/sensible";
import type { FastifyPluginAsync } from "fastify";

/**
 * @fastify/sensible — ergonomic reply helpers:
 * reply.notFound(), reply.unauthorized(), reply.forbidden(),
 * reply.badRequest(), reply.conflict(), reply.internalServerError(), etc.
 */
const sensiblePlugin: FastifyPluginAsync = async (fastify) => {
  await fastify.register(fastifySensible);
};

export default fp(sensiblePlugin, {
  name: "sensible",
  fastify: "5.x",
});
