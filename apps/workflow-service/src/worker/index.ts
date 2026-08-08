import { Worker } from "bullmq";
import { QUEUES, bullmqRedis, type WorkflowExecuteJob } from "@relayos/queue";
import { disconnectBullmqRedis } from "@relayos/queue";
import { disconnectRedis } from "@relayos/lib/redis";
import { logger } from "@relayos/lib/logger";
import { processExecution } from "./execution-worker.js";

const CONCURRENCY = Number(process.env.WORKER_CONCURRENCY ?? "5");

const worker = new Worker<WorkflowExecuteJob>(
  QUEUES.WORKFLOW_EXECUTE,
  processExecution,
  {
    connection: bullmqRedis,
    concurrency: CONCURRENCY,
  },
);

worker.on("completed", (job) => {
  logger.info({ jobId: job?.id }, "Job completed");
});

worker.on("failed", (job, err) => {
  logger.error({ jobId: job?.id, err }, "Job failed");
});

worker.on("error", (err) => {
  logger.error({ err }, "Worker error");
});

let shuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;

  logger.info({ signal }, "Shutting down worker");
  await worker.close();
  await disconnectBullmqRedis();
  await disconnectRedis();
  logger.info("Worker shut down");
  process.exit(0);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

logger.info(
  { queue: QUEUES.WORKFLOW_EXECUTE, concurrency: CONCURRENCY },
  "Workflow worker started",
);
