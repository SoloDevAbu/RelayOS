import { Type } from "@sinclair/typebox";

export const healthResponseSchema = Type.Object({
  status: Type.Literal("ok"),
  service: Type.Literal("workflow-service"),
  processType: Type.Union([Type.Literal("api"), Type.Literal("worker")]),
  uptime: Type.Number(),
});

export const healthSchema = {
  response: {
    200: healthResponseSchema,
  },
};
