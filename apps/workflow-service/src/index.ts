import "dotenv/config";
import { config } from "./config/env.js";
import { logger } from "@relayos/lib/logger";

async function main(): Promise<void> {
  const processType = config.PROCESS_TYPE;
  logger.info({ processType }, "Starting workflow-service");

  if (processType === "api") {
    const { buildApiApp } = await import("./api/index.js");
    const app = await buildApiApp();
    await app.listen({ port: config.PORT, host: config.HOST });
    logger.info(`API listening on http://${config.HOST}:${config.PORT}`);
  } else {
    await import("./worker/index.js");
  }
}

main().catch((err) => {
  logger.error({ err }, "Failed to start workflow-service");
  process.exit(1);
});
