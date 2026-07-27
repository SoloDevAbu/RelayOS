import fp from "fastify-plugin";
import fastifySwagger from "@fastify/swagger";
import fastifySwaggerUi from "@fastify/swagger-ui";
import type { FastifyPluginAsync } from "fastify";

/**
 * Swagger (OpenAPI) plugin.
 * Automatically generates OpenAPI definitions from TypeBox schemas and
 * serves the interactive Swagger UI at /api/v1/docs.
 */
const swaggerPlugin: FastifyPluginAsync = async (fastify) => {
  await fastify.register(fastifySwagger, {
    openapi: {
      info: {
        title: "RelayOS API",
        description: "API for RelayOS platform — auth, projects, API keys, workflows",
        version: "1.0.0",
      },
      components: {
        securitySchemes: {
          bearerAuth: {
            type: "http",
            scheme: "bearer",
            bearerFormat: "JWT",
          },
        },
      },
    },
    // We can hide certain routes if needed
    hideUntagged: false,
  });

  await fastify.register(fastifySwaggerUi, {
    routePrefix: "/api/v1/docs",
    uiConfig: {
      docExpansion: "list",
      deepLinking: false,
    },
    staticCSP: true,
    transformStaticCSP: (header) => header,
  });
};

export default fp(swaggerPlugin, {
  name: "swagger",
  fastify: "5.x",
});
