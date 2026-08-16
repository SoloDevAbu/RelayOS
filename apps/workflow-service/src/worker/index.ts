import { Worker } from "bullmq";
import { QUEUES, bullmqRedis, type WorkflowExecuteJob, type WorkflowRetryJob, type MemoryEmbedJob } from "@relayos/queue";
import { disconnectBullmqRedis } from "@relayos/queue";
import { disconnectRedis } from "@relayos/lib/redis";
import { logger } from "@relayos/lib/logger";
import { processExecution } from "./execution-worker.js";
import { processRetry } from "./retry-worker.js";
import { processMemoryEmbed } from "./memory-embed-worker.js";

const CONCURRENCY = Number(process.env.WORKER_CONCURRENCY ?? "5");

const executionWorker = new Worker<WorkflowExecuteJob>(
  QUEUES.WORKFLOW_EXECUTE,
  processExecution,
  {
    connection: bullmqRedis,
    concurrency: CONCURRENCY,
  },
);

const retryWorker = new Worker<WorkflowRetryJob>(
  QUEUES.WORKFLOW_RETRY,
  processRetry,
  {
    connection: bullmqRedis,
    concurrency: CONCURRENCY,
  },
);

const memoryEmbedWorker = new Worker<MemoryEmbedJob>(
  QUEUES.MEMORY_EMBED,
  processMemoryEmbed,
  {
    connection: bullmqRedis,
    concurrency: CONCURRENCY,
  },
);

executionWorker.on("completed", (job) => {
  logger.info({ jobId: job?.id }, "Execution job completed");
});

executionWorker.on("failed", (job, err) => {
  logger.error({ jobId: job?.id, err }, "Execution job failed");
});

executionWorker.on("error", (err) => {
  logger.error({ err }, "Execution worker error");
});

retryWorker.on("completed", (job) => {
  logger.info({ jobId: job?.id }, "Retry job completed");
});

retryWorker.on("failed", (job, err) => {
  logger.error({ jobId: job?.id, err }, "Retry job failed");
});

retryWorker.on("error", (err) => {
  logger.error({ err }, "Retry worker error");
});

memoryEmbedWorker.on("completed", (job) => {
  logger.info({ jobId: job?.id }, "Memory embed job completed");
});

memoryEmbedWorker.on("failed", (job, err) => {
  logger.error({ jobId: job?.id, err }, "Memory embed job failed");
});

memoryEmbedWorker.on("error", (err) => {
  logger.error({ err }, "Memory embed worker error");
});

let shuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;

  logger.info({ signal }, "Shutting down workers");
  await Promise.all([
    executionWorker.close(),
    retryWorker.close(),
    memoryEmbedWorker.close(),
  ]);
  await disconnectBullmqRedis();
  await disconnectRedis();
  logger.info("Workers shut down");
  process.exit(0);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

logger.info(
  { concurrency: CONCURRENCY },
  "Workflow workers started (execution + retry + memory-embed)",
);
