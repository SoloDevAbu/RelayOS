import fp from "fastify-plugin";
import type { FastifyPluginAsync } from "fastify";
import { redis } from "@relayos/lib/redis";

const redisPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.decorate("redis", redis);

  fastify.addHook("onClose", async () => {
    await redis.quit();
  });
};

export default fp(redisPlugin, {
  name: "redis",
  fastify: "5.x",
});
