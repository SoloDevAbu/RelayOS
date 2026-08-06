import { Redis } from "ioredis";
import { getRedisUrl } from "./config.js";
import { logger } from "./logger.js";

export type RedisClient = Redis;

let _instance: Redis | undefined;

function attachListeners(client: Redis): void {
  client.on("connect", () => logger.info("Redis connected"));
  client.on("ready", () => logger.info("Redis ready"));
  client.on("error", (err: Error) => logger.error({ err }, "Redis error"));
  client.on("reconnecting", () => logger.warn("Redis reconnecting"));
  client.on("end", () => logger.info("Redis connection ended"));
  client.on("close", () => logger.warn("Redis connection closed"));
}

export function createRedis(url?: string): Redis {
  const client = new Redis(url ?? getRedisUrl(), {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
    retryStrategy: (times) => Math.min(times * 50, 500),
    reconnectOnError: (err) => {
      const transient = ["READONLY", "ECONNRESET", "ETIMEDOUT", "ENOTFOUND"];
      return transient.some((e) => err.message.includes(e));
    },
  });
  attachListeners(client);
  return client;
}

export function getRedis(): Redis {
  if (!_instance) {
    _instance = createRedis();
  }
  return _instance;
}

export async function disconnectRedis(): Promise<void> {
  if (!_instance) return;
  try {
    await _instance.quit();
    logger.info("Redis disconnected gracefully");
  } catch (error) {
    logger.error({ error }, "Error during Redis disconnect");
  } finally {
    _instance = undefined;
  }
}


