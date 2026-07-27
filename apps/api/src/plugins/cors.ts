import fp from "fastify-plugin";
import fastifyCors from "@fastify/cors";
import type { FastifyPluginAsync } from "fastify";

/**
 * CORS plugin — allows origins listed in CORS_ORIGINS (comma-separated).
 * In development, also allows localhost on any port.
 */
const corsPlugin: FastifyPluginAsync = async (fastify) => {
  const origins = fastify.config.CORS_ORIGINS.split(",").map((o) => o.trim());

  await fastify.register(fastifyCors, {
    origin: (origin, callback) => {
      // Allow requests with no origin (server-to-server, curl, mobile)
      if (!origin) return callback(null, true);

      if (origins.includes(origin)) {
        return callback(null, true);
      }

      // Allow localhost on any port in development
      if (
        fastify.config.NODE_ENV === "development" &&
        /^https?:\/\/localhost(:\d+)?$/.test(origin)
      ) {
        return callback(null, true);
      }

      return callback(new Error("Not allowed by CORS"), false);
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    maxAge: 86400,
  });
};

export default fp(corsPlugin, {
  name: "cors",
  fastify: "5.x",
  dependencies: ["config"],
});
