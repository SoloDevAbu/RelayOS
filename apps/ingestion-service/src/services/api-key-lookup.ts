import { eq, and, isNull } from "drizzle-orm";
import { apiKeys } from "@relayos/db/schema";
import type { db as DrizzleDb } from "@relayos/db/client";
import type { RedisClient } from "@relayos/lib/redis";

const CACHE_PREFIX = "relay:apikey:";
const CACHE_TTL_SECONDS = 300;

export async function lookupApiKey(
  keyHash: string,
  db: typeof DrizzleDb,
  redis: RedisClient,
): Promise<{ projectId: string } | null> {
  const cacheKey = `${CACHE_PREFIX}${keyHash}`;

  const cached = await redis.get(cacheKey);
  if (cached) {
    return { projectId: cached };
  }

  const [row] = await db
    .select({ projectId: apiKeys.projectId })
    .from(apiKeys)
    .where(and(eq(apiKeys.keyHash, keyHash), isNull(apiKeys.revokedAt)))
    .limit(1);

  if (!row) return null;

  await redis.setex(cacheKey, CACHE_TTL_SECONDS, row.projectId);

  return { projectId: row.projectId };
}
