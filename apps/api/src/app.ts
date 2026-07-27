import Fastify, { type FastifyInstance } from "fastify";
import { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";

// Plugins
import configPlugin from "./plugins/config.js";
import dbPlugin from "./plugins/db.js";
import jwtPlugin from "./plugins/jwt.js";
import corsPlugin from "./plugins/cors.js";
import helmetPlugin from "./plugins/helmet.js";
import rateLimitPlugin from "./plugins/rate-limit.js";
import sensiblePlugin from "./plugins/sensible.js";
import errorHandlerPlugin from "./plugins/error-handler.js";
import swaggerPlugin from "./plugins/swagger.js";

// Routes
import routes from "./routes/index.js";

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? "info",
      redact: [
        "req.headers.authorization",
        "req.headers['x-api-key']",
        "*.password",
        "*.passwordHash",
        "*.secret",
        "*.tokenHash",
      ],
    },
    trustProxy: true,
    bodyLimit: 2 * 1024 * 1024, // 2 MB
    ajv: {
      customOptions: {
        removeAdditional: "all",
        useDefaults: true,
        coerceTypes: "array",
        allErrors: true,
      },
    },
  }).withTypeProvider<TypeBoxTypeProvider>();

  // config first — all other plugins depend on fastify.config
  await app.register(configPlugin);
  await app.register(dbPlugin);
  await app.register(corsPlugin);
  await app.register(helmetPlugin);
  await app.register(sensiblePlugin);
  await app.register(swaggerPlugin);
  await app.register(rateLimitPlugin);
  await app.register(jwtPlugin);
  await app.register(errorHandlerPlugin);

  app.addHook("onRequest", async (request) => {
    request.startTime = Date.now();
  });

  app.addHook("onResponse", async (request, reply) => {
    const responseTime = Date.now() - request.startTime;
    request.log.info(
      {
        method: request.method,
        url: request.url,
        statusCode: reply.statusCode,
        responseTime,
      },
      "Request completed",
    );
  });

  await app.register(routes, { prefix: "/api/v1" });

  return app as unknown as FastifyInstance;
}
