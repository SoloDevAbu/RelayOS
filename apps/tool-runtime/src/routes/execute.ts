import type { FastifyPluginAsync } from "fastify";
import { getTool } from "../tools/registry.js";

interface ExecuteParams {
  toolId: string;
}

interface ExecuteBody {
  input: Record<string, unknown>;
  executionId: string;
}

const executeRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post<{ Params: ExecuteParams; Body: ExecuteBody }>(
    "/tools/:toolId/execute",
    {
      schema: {
        params: {
          type: "object",
          required: ["toolId"],
          properties: {
            toolId: { type: "string" },
          },
        },
        body: {
          type: "object",
          required: ["input", "executionId"],
          properties: {
            input: { type: "object" },
            executionId: { type: "string" },
          },
        },
      },
    },
    async (request, reply) => {
      const { toolId } = request.params;
      const { input, executionId } = request.body;

      const executor = getTool(toolId);
      if (!executor) {
        return reply.status(404).send({ error: `Tool "${toolId}" not registered` });
      }

      try {
        const result = await executor(input, executionId);
        return reply.status(200).send(result);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return reply.status(500).send({ error: message });
      }
    },
  );
};

export default executeRoute;
