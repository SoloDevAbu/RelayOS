import type { db as DrizzleDb } from "@relayos/db/client";
import type { RedisClient } from "@relayos/lib/redis";

declare module "fastify" {
  interface FastifyInstance {
    config: import("./config/env.js").AppConfig;
    db: typeof DrizzleDb;
    redis: RedisClient;
  }

  interface FastifyRequest {
    startTime: number;
  }
}
