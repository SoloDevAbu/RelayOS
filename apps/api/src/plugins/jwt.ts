import fp from "fastify-plugin";
import fastifyJwt from "@fastify/jwt";
import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from "fastify";

declare module "fastify" {
  interface FastifyInstance {
    authenticate: (
      request: FastifyRequest,
      reply: FastifyReply,
    ) => Promise<void>;
  }
}

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: { id: string; email: string };
    user: { id: string; email: string };
  }
}

/**
 * Registers @fastify/jwt and decorates `fastify.authenticate` — a preHandler
 * guard that verifies the Bearer token and populates `request.user`.
 */
const jwtPlugin: FastifyPluginAsync = async (fastify) => {
  const { JWT_SECRET, JWT_ACCESS_TTL } = fastify.config;

  await fastify.register(fastifyJwt, {
    secret: JWT_SECRET,
    sign: {
      expiresIn: JWT_ACCESS_TTL,
    },
  });

  fastify.decorate(
    "authenticate",
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        await request.jwtVerify();
      } catch {
        return reply.code(401).send({
          statusCode: 401,
          error: "Unauthorized",
          message: "Invalid or expired access token",
        });
      }
    },
  );
};

export default fp(jwtPlugin, {
  name: "jwt",
  fastify: "5.x",
  dependencies: ["config"],
});
