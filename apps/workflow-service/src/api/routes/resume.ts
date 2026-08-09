import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from "fastify";
import { resumeSchema, type ResumeBodyType } from "../../schemas/resume.js";
import {
  resumeExecution,
  ApprovalAlreadyDecidedError,
  ExecutionNotWaitingError,
  ExecutionNotFoundError,
} from "../../services/resume-service.js";

const resumeRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook(
    "onRequest",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const secret = request.headers["x-internal-secret"];
      if (secret !== fastify.config.INTERNAL_SERVICE_SECRET) {
        return reply.code(401).send({
          statusCode: 401,
          error: "Unauthorized",
          message: "Missing or invalid internal service secret",
        });
      }
    },
  );

  fastify.post<{ Params: { id: string }; Body: ResumeBodyType }>(
    "/:id/resume",
    { schema: resumeSchema },
    async (request, reply) => {
      const { id } = request.params;
      const { decision } = request.body;

      try {
        await resumeExecution(id, decision);
        return reply.send({ ok: true });
      } catch (error) {
        if (error instanceof ExecutionNotFoundError) {
          return reply.code(404).send({
            statusCode: 404,
            error: "Not Found",
            message: error.message,
          });
        }

        if (error instanceof ExecutionNotWaitingError) {
          return reply.code(409).send({
            statusCode: 409,
            error: "Conflict",
            message: error.message,
          });
        }

        if (error instanceof ApprovalAlreadyDecidedError) {
          return reply.code(409).send({
            statusCode: 409,
            error: "Conflict",
            message: error.message,
          });
        }

        throw error;
      }
    },
  );
};

export default resumeRoutes;
