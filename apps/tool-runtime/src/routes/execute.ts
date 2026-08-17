import type { FastifyPluginAsync } from "fastify";
import type { ToolExecutionResult } from "@relayos/types";
import { loadTool } from "../registry/tool-loader.js";
import { getDecryptedCredential } from "../registry/credentials-client.js";
import { validateInput } from "../validation/schema-validator.js";
import { callWebhook, WebhookTimeoutError, WebhookNetworkError } from "../execution/webhook-executor.js";
import { shapeSuccess, shapeHttpError, shapeError } from "../execution/result-shaper.js";
import { runLocalTool } from "../execution/local-executor.js";

interface ExecuteBody {
  toolId: string;
  input: Record<string, unknown>;
  executionId: string;
  stepId: string;
  attempt: number;
}

const executeRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post<{ Body: ExecuteBody }>(
    "/execute",
    {
      schema: {
        body: {
          type: "object",
          required: ["toolId", "input", "executionId", "stepId", "attempt"],
          properties: {
            toolId: { type: "string" },
            input: { type: "object" },
            executionId: { type: "string" },
            stepId: { type: "string" },
            attempt: { type: "integer", minimum: 1 },
          },
        },
      },
    },
    async (request, reply) => {
      const { toolId, input, executionId, stepId, attempt } = request.body;

      let tool: Awaited<ReturnType<typeof loadTool>>;
      try {
        tool = await loadTool(toolId);
      } catch {
        return reply.status(404).send({
          success: false,
          error: `Tool "${toolId}" not found`,
          retryable: false,
          durationMs: 0,
        } satisfies ToolExecutionResult);
      }

      const inputSchema = tool.inputSchema as Record<string, unknown>;
      const validation = validateInput(toolId, inputSchema, input);
      if (!validation.valid) {
        return reply.status(422).send({
          success: false,
          error: `Input validation failed: ${validation.errors.map((e) => `${e.field} ${e.message}`).join("; ")}`,
          retryable: false,
          durationMs: 0,
        } satisfies ToolExecutionResult);
      }

      if (tool.invocationType === "LOCAL") {
        const result = await runLocalTool({ toolId, input, executionId });
        return reply.status(result.success ? 200 : 500).send(result);
      }

      // WEBHOOK path
      const credential = await getDecryptedCredential(toolId);

      const idempotencyKey = `${executionId}:${stepId}:${attempt}`;

      let result: ToolExecutionResult;
      try {
        const response = await callWebhook({
          url: tool.url!,
          httpMethod: tool.httpMethod,
          timeoutMs: tool.timeoutMs,
          authType: tool.authType,
          authHeaderName: tool.authHeaderName,
          credential,
          idempotencyKey,
          body: input,
        });

        result =
          response.statusCode >= 200 && response.statusCode < 300
            ? shapeSuccess(response)
            : shapeHttpError(response);
      } catch (err) {
        result = shapeError(err);
      }

      return reply.status(result.success ? 200 : 500).send(result);
    },
  );
};

export default executeRoute;
