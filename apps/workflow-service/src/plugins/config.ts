import fp from "fastify-plugin";
import type { FastifyPluginAsync } from "fastify";
import { config, type AppConfig } from "../config/env.js";

declare module "fastify" {
  interface FastifyInstance {
    config: AppConfig;
  }
}

const configPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.decorate("config", config);
};

export default fp(configPlugin, {
  name: "config",
  fastify: "5.x",
});
