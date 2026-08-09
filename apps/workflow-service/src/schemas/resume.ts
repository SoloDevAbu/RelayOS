import { Type } from "@sinclair/typebox";

export const resumeBodySchema = Type.Object({
  decision: Type.Union([Type.Literal("APPROVED"), Type.Literal("REJECTED")]),
});

export const resumeSchema = {
  body: resumeBodySchema,
  response: {
    200: Type.Object({ ok: Type.Boolean() }),
    400: Type.Object({ statusCode: Type.Number(), error: Type.String(), message: Type.String() }),
    404: Type.Object({ statusCode: Type.Number(), error: Type.String(), message: Type.String() }),
    409: Type.Object({ statusCode: Type.Number(), error: Type.String(), message: Type.String() }),
  },
};

export type ResumeBodyType = { decision: "APPROVED" | "REJECTED" };
