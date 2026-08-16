import type { Job } from "bullmq";
import type { MemoryEmbedJob } from "@relayos/queue";
import { embed } from "../memory/memory-service.js";

export async function processMemoryEmbed(
  job: Job<MemoryEmbedJob>,
): Promise<void> {
  const { content, scope, executionId, projectId, sourceStepId } = job.data;
  await embed(content, scope, { executionId, projectId, sourceStepId });
}
