import { Redis } from "ioredis";

export const bullmqRedis = new Redis(process.env.REDIS_URL!, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  retryStrategy: (times: number) => {
    return Math.min(times * 50, 2000);
  },
});
