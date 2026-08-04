import Fastify, { type FastifyInstance } from "fastify";
import { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";

import configPlugin from "./plugins/config.js";
import dbPlugin from "./plugins/db.js";
import redisPlugin from "./plugins/redis.js";
import corsPlugin from "./plugins/cors.js";
import sensiblePlugin from "./plugins/sensible.js";
import rateLimitPlugin from "./plugins/rate-limit.js";
import errorHandlerPlugin from "./plugins/error-handler.js";

import routes from "./routes/index.js";

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? "info",
      ...(process.env.NODE_ENV !== "production"
        ? {
            transport: {
              target: "pino-pretty",
              options: {
                translateTime: "HH:MM:ss Z",
                ignore: "pid,hostname",
              },
            },
          }
        : {}),
      redact: ["req.headers.authorization"],
    },
    trustProxy: true,
    bodyLimit: 1 * 1024 * 1024, // 1 MB — trigger payloads should be small
    ajv: {
      customOptions: {
        removeAdditional: "all",
        useDefaults: true,
        coerceTypes: "array",
        allErrors: true,
      },
    },
  }).withTypeProvider<TypeBoxTypeProvider>();

  await app.register(configPlugin);
  await app.register(dbPlugin);
  await app.register(redisPlugin);
  await app.register(corsPlugin);
  await app.register(sensiblePlugin);
  await app.register(rateLimitPlugin);
  await app.register(errorHandlerPlugin);

  app.addHook("onRequest", async (request) => {
    request.startTime = Date.now();
  });

  app.addHook("onResponse", async (request, reply) => {
    request.log.info(
      {
        method: request.method,
        url: request.url,
        statusCode: reply.statusCode,
        responseTime: Date.now() - request.startTime,
      },
      "Request completed",
    );
  });

  await app.register(routes, { prefix: "/v1" });

  return app as unknown as FastifyInstance;
}
