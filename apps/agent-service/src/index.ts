import "dotenv/config";
import Fastify from "fastify";
import { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";

import configPlugin from "./plugins/config.js";
import sensiblePlugin from "./plugins/sensible.js";
import errorHandlerPlugin from "./plugins/error-handler.js";
import planRoute from "./routes/plan.js";
import { initTracing } from "./tracing/langfuse-client.js";

async function buildApp() {
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
  await app.register(sensiblePlugin);
  await app.register(errorHandlerPlugin);

  app.get("/health", async () => ({
    status: "ok" as const,
    service: "agent-service" as const,
    uptime: process.uptime(),
  }));

  await app.register(planRoute, { prefix: "/internal" });

  return app;
}

async function start() {
  initTracing();

  const app = await buildApp();
  const { PORT, HOST } = app.config;

  await app.listen({ port: PORT, host: HOST });
  app.log.info(`Agent service listening on http://${HOST}:${PORT}`);
}

let shuttingDown = false;

async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`\nReceived ${signal}, shutting down gracefully...`);
  process.exit(0);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

start().catch((err) => {
  console.error("Failed to start agent-service", err);
  process.exit(1);
});
