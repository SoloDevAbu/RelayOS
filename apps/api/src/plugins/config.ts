import fp from "fastify-plugin";
import type { FastifyPluginAsync } from "fastify";
import { config, type AppConfig } from "../config/env.js";

declare module "fastify" {
  interface FastifyInstance {
    config: AppConfig;
  }
}

/**
 * Decorates `fastify.config` with the validated env config.
 * Must be the first plugin registered so others can access config.
 */
const configPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.decorate("config", config);
};

export default fp(configPlugin, {
  name: "config",
  fastify: "5.x",
});
