import { Redis } from "ioredis";
import { redisUrl } from "./config";
import { logger } from "./logger";

/**
 * Singleton instance of the Redis client
 */

export const redis = new Redis(redisUrl, {
  maxRetriesPerRequest: null,
  enableReadyCheck: true,

  retryStrategy(times: number) {
    const delay = Math.min(times * 50, 500);
    return delay;
  },

  reconnectOnError(err: Error) {
    const targetErrors = ["READONLY", "ECONNRESET", "ETIMEDOUT", "ENOTFOUND"];
    if (targetErrors.some((e) => err.message.includes(e))) {
      return true;
    }
    return false;
  },
});

/**
 * Event Listeners
 */

redis.on("connect", () => {
  logger.info("Redis connected");
});

redis.on("ready", () => {
  logger.info("Redis ready");
});

redis.on("error", (err: Error) => {
  logger.error({ err }, "Redis error");
});

redis.on("reconnecting", () => {
  logger.warn("Redis reconnecting");
});

redis.on("end", () => {
  logger.info("Redis connection ended");
});

redis.on("close", () => {
  logger.warn("Redis connection closed");
});

export const disconnectRedis = async (): Promise<void> => {
  try {
    await redis.quit();
    logger.info("Redis disconnected gracefully");
  } catch (error) {
    logger.error({ error }, "Error during Redis disconnect");
  }
};
