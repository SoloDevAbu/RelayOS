import { Worker } from "bullmq";
import { QUEUES, bullmqRedis, type WorkflowExecuteJob, type WorkflowRetryJob } from "@relayos/queue";
import { disconnectBullmqRedis } from "@relayos/queue";
import { disconnectRedis } from "@relayos/lib/redis";
import { logger } from "@relayos/lib/logger";
import { processExecution } from "./execution-worker.js";
import { processRetry } from "./retry-worker.js";

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

let shuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;

  logger.info({ signal }, "Shutting down workers");
  await Promise.all([executionWorker.close(), retryWorker.close()]);
  await disconnectBullmqRedis();
  await disconnectRedis();
  logger.info("Workers shut down");
  process.exit(0);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

logger.info(
  { concurrency: CONCURRENCY },
  "Workflow workers started (execution + retry)",
);
