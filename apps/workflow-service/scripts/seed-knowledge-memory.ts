import "dotenv/config";
import { db } from "@relayos/db/client";
import { memoryChunks } from "@relayos/db/schema";
import { getEmbedding } from "../src/memory/embedding-client.js";

async function main(): Promise<void> {
  const projectId = process.argv[2];
  const text = process.argv[3];

  if (!projectId || !text) {
    console.error(
      "Usage: npx tsx scripts/seed-knowledge-memory.ts <projectId> \"knowledge text\"",
    );
    process.exit(1);
  }

  console.log(`Embedding text: "${text.slice(0, 80)}..."`);
  const embedding = await getEmbedding(text);
  console.log(`Got ${embedding.length}-dimensional embedding`);

  await db.insert(memoryChunks).values({
    scope: "KNOWLEDGE",
    projectId,
    content: text,
    embedding,
  });

  console.log(`Inserted KNOWLEDGE memory chunk for project ${projectId}`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Failed to seed knowledge memory:", err);
  process.exit(1);
});
