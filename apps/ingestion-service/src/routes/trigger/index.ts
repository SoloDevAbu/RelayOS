import type { FastifyPluginAsync } from "fastify";
import { Type } from "@sinclair/typebox";
import { triggerHandler } from "./handler.js";

const triggerRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post(
    "/",
    {
      schema: {
        body: Type.Object({
          workflowId: Type.String({ format: "uuid" }),
          payload: Type.Optional(
            Type.Record(Type.String(), Type.Unknown()),
          ),
        }),
        response: {
          202: Type.Object({
            executionId: Type.String({ format: "uuid" }),
            status: Type.Literal("PENDING"),
          }),
        },
      },
    },
    triggerHandler,
  );
};

export default triggerRoutes;
