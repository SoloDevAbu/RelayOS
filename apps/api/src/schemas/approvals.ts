import { Type } from "@sinclair/typebox";

export const approvalParamsSchema = Type.Object({
  approvalId: Type.String({ format: "uuid" }),
});

export const approveSchema = {
  params: approvalParamsSchema,
  response: {
    200: Type.Object({ ok: Type.Boolean() }),
  },
};

export const rejectSchema = {
  params: approvalParamsSchema,
  response: {
    200: Type.Object({ ok: Type.Boolean() }),
  },
};

export type ApprovalParamsType = { approvalId: string };
