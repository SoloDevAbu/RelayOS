import fp from "fastify-plugin";
import fastifyCors from "@fastify/cors";
import type { FastifyPluginAsync } from "fastify";

const corsPlugin: FastifyPluginAsync = async (fastify) => {
  await fastify.register(fastifyCors, {
    origin: false,
    methods: ["POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  });
};

export default fp(corsPlugin, {
  name: "cors",
  fastify: "5.x",
});
