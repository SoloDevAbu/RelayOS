import { buildApp } from "./app.js";

const start = async () => {
  let app;

  try {
    app = await buildApp();
    const { PORT, HOST } = app.config;

    await app.listen({ port: PORT, host: HOST });
    app.log.info(`RelayOS API listening on http://${HOST}:${PORT}`);
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
    // buildApp() must have succeeded for us to be here
    const app = await buildApp();
    await app.close();
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
