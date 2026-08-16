import { db } from "@relayos/db/client";
import { memoryChunks } from "@relayos/db/schema";
import { sql } from "drizzle-orm";
import { getEmbedding } from "./embedding-client.js";

export interface RecalledMemory {
  content: string;
  similarity: number;
}

export async function recall(
  query: string,
  executionId: string,
  projectId: string,
  topK: number,
): Promise<RecalledMemory[]> {
  const queryEmbedding = await getEmbedding(query);
  const vectorLiteral = `[${queryEmbedding.join(",")}]`;

  const result = await db.execute(sql`
    SELECT content, 1 - (embedding <=> ${vectorLiteral}::vector) AS similarity
    FROM memory_chunks
    WHERE (scope = 'EXECUTION' AND execution_id = ${executionId})
       OR (scope = 'KNOWLEDGE' AND project_id = ${projectId})
    ORDER BY embedding <=> ${vectorLiteral}::vector
    LIMIT ${topK}
  `);

  const rows = result.rows as { content: string; similarity: string }[];

  return rows.map((row) => ({
    content: row.content,
    similarity: Number(row.similarity),
  }));
}

interface EmbedIds {
  executionId?: string;
  projectId: string;
  sourceStepId?: string;
}

export async function embed(
  content: string,
  scope: "EXECUTION" | "KNOWLEDGE",
  ids: EmbedIds,
): Promise<void> {
  const vector = await getEmbedding(content);

  await db.insert(memoryChunks).values({
    scope,
    executionId: ids.executionId ?? null,
    projectId: ids.projectId,
    sourceStepId: ids.sourceStepId ?? null,
    content,
    embedding: vector,
  });
}
