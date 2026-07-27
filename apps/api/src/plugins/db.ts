import fp from "fastify-plugin";
import type { FastifyPluginAsync } from "fastify";
import { db } from "@relayos/db/client";

declare module "fastify" {
  interface FastifyInstance {
    db: typeof db;
  }
}

/**
 * Decorates the Fastify instance with the Drizzle ORM client (`fastify.db`).
 * Uses fastify-plugin so the decorator is visible to sibling/parent plugins.
 */
const dbPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.decorate("db", db);

  fastify.addHook("onClose", async () => {
    fastify.log.info("Closing DB connection pool");
    // Drizzle with node-postgres manages the underlying pg Pool.
    // No explicit close needed unless we hold a Pool reference directly.
  });
};

export default fp(dbPlugin, {
  name: "db",
  fastify: "5.x",
});
