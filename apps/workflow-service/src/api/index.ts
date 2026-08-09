import Fastify from "fastify";
import { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import configPlugin from "../plugins/config.js";
import errorHandlerPlugin from "../plugins/error-handler.js";
import { healthSchema } from "../schemas/health.js";
import resumeRoutes from "./routes/resume.js";

export async function buildApiApp() {
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
      redact: ["req.headers.authorization", "req.headers['x-internal-secret']"],
    },
    trustProxy: true,
    ajv: {
      customOptions: {
        removeAdditional: "all",
        useDefaults: true,
        allErrors: true,
      },
    },
  }).withTypeProvider<TypeBoxTypeProvider>();

  await app.register(configPlugin);
  await app.register(errorHandlerPlugin);

  app.get("/health", { schema: healthSchema }, async (_request, reply) => {
    return reply.send({
      status: "ok" as const,
      service: "workflow-service" as const,
      processType: "api" as const,
      uptime: process.uptime(),
    });
  });

  app.register(resumeRoutes, { prefix: "/internal/executions" });

  return app;
}

