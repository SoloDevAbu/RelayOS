import type { FastifyPluginAsync } from "fastify";
import { createApiKey, listApiKeys, revokeApiKey } from "./handlers.js";
import {
  createApiKeySchema,
  listApiKeysSchema,
  revokeApiKeySchema,
} from "../../schemas/api-keys.js";

/**
 * API key routes
 */
const apiKeyRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook("onRequest", fastify.authenticate);

  fastify.post("/", { schema: createApiKeySchema }, createApiKey);
  fastify.get("/", { schema: listApiKeysSchema }, listApiKeys);
  fastify.delete("/:keyId", { schema: revokeApiKeySchema }, revokeApiKey);
};

export default apiKeyRoutes;
