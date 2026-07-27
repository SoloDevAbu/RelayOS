import type { FastifyInstance } from "fastify";
import type { db as DrizzleDb } from "@relayos/db/client";

/**
 * Global Fastify type augmentations for decorators added by plugins.
 * Keep in sync with plugin registrations in plugins/*.ts
 */
declare module "fastify" {
  interface FastifyInstance {
    /** Validated environment config (registered by plugins/db.ts via config/env.ts) */
    config: import("./config/env.js").AppConfig;
    /** Drizzle ORM instance (registered by plugins/db.ts) */
    db: typeof DrizzleDb;
    /**
     * Prehandler guard — verifies JWT access token.
     * Use as `onRequest: [fastify.authenticate]` on protected routes.
     */
    authenticate: (
      request: import("fastify").FastifyRequest,
      reply: import("fastify").FastifyReply,
    ) => Promise<void>;
  }

  interface FastifyRequest {
    /** Authenticated user payload decoded from JWT */
    user?: {
      id: string;
      email: string;
    };
    /** Unix ms timestamp set in onRequest for response-time tracking */
    startTime: number;
  }
}
