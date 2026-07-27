import fp from "fastify-plugin";
import type {
  FastifyPluginAsync,
  FastifyError,
  FastifyRequest,
  FastifyReply,
} from "fastify";

/**
 * Central error handler and 404 handler.
 *
 * Handles:
 *  1. Validation errors (AJV) → 400 with field details
 *  2. Known HTTP errors with statusCode → pass through
 *  3. Unknown errors → 500, message hidden in production
 */
const errorHandlerPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.setErrorHandler(
    (error: FastifyError, request: FastifyRequest, reply: FastifyReply) => {
      // Log the error (Pino structured logging)
      if (error.statusCode && error.statusCode < 500) {
        request.log.warn({ err: error }, "Client error");
      } else {
        request.log.error({ err: error }, "Server error");
      }

      // AJV validation errors
      if (error.validation) {
        const details = error.validation.map((err) => ({
          field:
            err.instancePath
              ? err.instancePath.slice(1).replace(/\//g, ".")
              : ((err.params as Record<string, string>)?.missingProperty ??
                "unknown"),
          message: err.message ?? "Invalid value",
          keyword: err.keyword,
        }));

        return reply.code(400).send({
          statusCode: 400,
          error: "Validation Error",
          message: `Validation failed on ${error.validationContext ?? "request"}`,
          details,
        });
      }

      const statusCode = error.statusCode ?? 500;
      const isProduction = fastify.config.NODE_ENV === "production";

      // Never leak internal details in production
      const message =
        statusCode >= 500 && isProduction
          ? "Internal Server Error"
          : (error.message ?? "An unexpected error occurred");

      return reply.code(statusCode).send({
        statusCode,
        error: error.code ?? (statusCode >= 500 ? "INTERNAL_ERROR" : "ERROR"),
        message,
      });
    },
  );

  fastify.setNotFoundHandler((request: FastifyRequest, reply: FastifyReply) => {
    return reply.code(404).send({
      statusCode: 404,
      error: "Not Found",
      message: `Route ${request.method} ${request.url} not found`,
    });
  });
};

export default fp(errorHandlerPlugin, {
  name: "error-handler",
  fastify: "5.x",
  dependencies: ["config"],
});
