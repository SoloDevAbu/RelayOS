import { createRedis, type RedisClient } from "@relayos/lib/redis";

export const bullmqRedis: RedisClient = createRedis();

export async function disconnectBullmqRedis(): Promise<void> {
  await bullmqRedis.quit();
}
