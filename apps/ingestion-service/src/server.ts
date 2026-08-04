import { buildApp } from "./app.js";
import type { FastifyInstance } from "fastify";

let app: FastifyInstance | undefined;

const start = async () => {
  try {
    app = await buildApp();
    const { PORT, HOST } = app.config;

    await app.listen({ port: PORT, host: HOST });
    app.log.info(`Ingestion service listening on http://${HOST}:${PORT}`);
  } catch (err) {
    if (app) {
      app.log.error(err, "Failed to start server");
    } else {
      console.error("Failed to start server", err);
    }
    process.exit(1);
  }
};

let shuttingDown = false;

async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;

  console.log(`\nReceived ${signal}, shutting down gracefully...`);

  try {
    if (app) {
      await app.close();
    }
    console.log("Server closed");
    process.exit(0);
  } catch (err) {
    console.error("Error during shutdown", err);
    process.exit(1);
  }
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

start();
