import fp from "fastify-plugin";
import type { FastifyPluginAsync } from "fastify";
import { db } from "@relayos/db/client";

declare module "fastify" {
  interface FastifyInstance {
    db: typeof db;
  }
}

const dbPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.decorate("db", db);
};

export default fp(dbPlugin, {
  name: "db",
  fastify: "5.x",
});
