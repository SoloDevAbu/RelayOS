import fp from "fastify-plugin";
import type { FastifyPluginAsync } from "fastify";
import { getRedis, disconnectRedis } from "@relayos/lib/redis";

const redisPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.decorate("redis", getRedis());

  fastify.addHook("onClose", async () => {
    await disconnectRedis();
  });
};

export default fp(redisPlugin, {
  name: "redis",
  fastify: "5.x",
});
