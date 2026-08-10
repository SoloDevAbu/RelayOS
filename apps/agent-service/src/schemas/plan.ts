import { Type, type Static } from "@sinclair/typebox";

const ToolDefinitionSchema = Type.Object({
  name: Type.String(),
  description: Type.String(),
  inputSchema: Type.Record(Type.String(), Type.Unknown()),
});

const IterationEntrySchema = Type.Object({
  action: Type.String(),
  tool: Type.Optional(Type.String()),
  input: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
  result: Type.Optional(Type.Unknown()),
  reasoning: Type.Optional(Type.String()),
});

const MemoryEntrySchema = Type.Object({
  content: Type.String(),
  relevance: Type.Optional(Type.Number()),
});

export const planRequestSchema = Type.Object({
  goal: Type.String({ minLength: 1 }),
  context: Type.Record(Type.String(), Type.Unknown(), { default: {} }),
  memories: Type.Array(MemoryEntrySchema, { default: [] }),
  iterationHistory: Type.Array(IterationEntrySchema, { default: [] }),
  availableTools: Type.Array(ToolDefinitionSchema, { minItems: 0 }),
});

export type PlanRequest = Static<typeof planRequestSchema>;

const ToolCallResponse = Type.Object({
  action: Type.Literal("tool_call"),
  tool: Type.String(),
  input: Type.Record(Type.String(), Type.Unknown()),
  reasoning: Type.String(),
});

const CompleteResponse = Type.Object({
  action: Type.Literal("complete"),
  summary: Type.String(),
  reasoning: Type.String(),
});

const RequestApprovalResponse = Type.Object({
  action: Type.Literal("request_approval"),
  message: Type.String(),
  reasoning: Type.String(),
});

export const planResponseSchema = Type.Union([
  ToolCallResponse,
  CompleteResponse,
  RequestApprovalResponse,
]);

export type PlanResponse = Static<typeof planResponseSchema>;

export const planRouteSchema = {
  body: planRequestSchema,
  response: {
    200: planResponseSchema,
  },
};
