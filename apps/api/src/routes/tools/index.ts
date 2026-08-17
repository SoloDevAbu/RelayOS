import type { FastifyPluginAsync } from "fastify";
import { createTool, listTools, getTool, updateTool, deleteTool } from "./handlers.js";
import {
  createToolSchema,
  listToolsSchema,
  getToolSchema,
  updateToolSchema,
  deleteToolSchema,
} from "../../schemas/tools.js";

const toolRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook("onRequest", fastify.authenticate);

  fastify.post("/", { schema: createToolSchema }, createTool);
  fastify.get("/", { schema: listToolsSchema }, listTools);
  fastify.get("/:toolId", { schema: getToolSchema }, getTool);
  fastify.put("/:toolId", { schema: updateToolSchema }, updateTool);
  fastify.delete("/:toolId", { schema: deleteToolSchema }, deleteTool);
};

export default toolRoutes;
