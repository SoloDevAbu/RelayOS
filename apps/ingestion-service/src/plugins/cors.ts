import fp from "fastify-plugin";
import fastifyCors from "@fastify/cors";
import type { FastifyPluginAsync } from "fastify";

const corsPlugin: FastifyPluginAsync = async (fastify) => {
  await fastify.register(fastifyCors, {
    origin: true, // Allow all origins (or configure specific origins)
    methods: ["POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  });
};

export default fp(corsPlugin, {
  name: "cors",
  fastify: "5.x",
});
