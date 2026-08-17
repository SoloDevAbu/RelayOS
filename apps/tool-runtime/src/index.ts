import "dotenv/config";
import Fastify from "fastify";

import "./tools/flaky-test-tool.js";
import "./tools/say-hello.js";

import executeRoute from "./routes/execute.js";

const PORT = Number(process.env.PORT ?? "8080");
const HOST = process.env.HOST ?? "0.0.0.0";

async function start(): Promise<void> {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? "info",
      ...(process.env.NODE_ENV !== "production"
        ? {
            transport: {
              target: "pino-pretty",
              options: { translateTime: "HH:MM:ss Z", ignore: "pid,hostname" },
            },
          }
        : {}),
    },
  });

  await app.register(executeRoute, { prefix: "/internal" });

  app.get("/health", async () => ({ status: "ok" }));

  await app.listen({ port: PORT, host: HOST });
}

start().catch((err) => {
  console.error(err);
  process.exit(1);
});
