import { Type, type Static } from "@sinclair/typebox";

const InvocationType = Type.Union([
  Type.Literal("LOCAL"),
  Type.Literal("WEBHOOK"),
]);

const AuthType = Type.Union([
  Type.Literal("NONE"),
  Type.Literal("BEARER"),
  Type.Literal("API_KEY_HEADER"),
  Type.Literal("BASIC"),
]);

const HttpMethod = Type.Union([
  Type.Literal("POST"),
  Type.Literal("GET"),
  Type.Literal("PUT"),
  Type.Literal("PATCH"),
  Type.Literal("DELETE"),
]);

const ToolParams = Type.Object({
  projectId: Type.String({ format: "uuid" }),
  toolId: Type.String({ format: "uuid" }),
});
export type ToolParamsType = Static<typeof ToolParams>;

const ProjectToolParams = Type.Object({
  projectId: Type.String({ format: "uuid" }),
});

export const ToolResponse = Type.Object({
  id: Type.String({ format: "uuid" }),
  projectId: Type.String({ format: "uuid" }),
  name: Type.String(),
  description: Type.String(),
  inputSchema: Type.Unknown(),
  outputSchema: Type.Union([Type.Unknown(), Type.Null()]),
  invocationType: InvocationType,
  url: Type.Union([Type.String(), Type.Null()]),
  httpMethod: Type.String(),
  timeoutMs: Type.Integer(),
  authType: AuthType,
  authHeaderName: Type.Union([Type.String(), Type.Null()]),
  hasCredential: Type.Boolean(),
  createdAt: Type.String({ format: "date-time" }),
  updatedAt: Type.String({ format: "date-time" }),
});
export type ToolResponseType = Static<typeof ToolResponse>;

export const CreateToolBody = Type.Object(
  {
    name: Type.String({ minLength: 1, maxLength: 255 }),
    description: Type.String({ maxLength: 2000 }),
    inputSchema: Type.Record(Type.String(), Type.Unknown()),
    outputSchema: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
    invocationType: InvocationType,
    url: Type.Optional(Type.String({ maxLength: 2048 })),
    httpMethod: Type.Optional(HttpMethod),
    timeoutMs: Type.Optional(Type.Integer({ minimum: 100, maximum: 30000 })),
    authType: Type.Optional(AuthType),
    authHeaderName: Type.Optional(Type.String({ maxLength: 255 })),
    credential: Type.Optional(Type.String({ minLength: 1 })),
  },
  { additionalProperties: false },
);
export type CreateToolBodyType = Static<typeof CreateToolBody>;

export const UpdateToolBody = Type.Object(
  {
    name: Type.Optional(Type.String({ minLength: 1, maxLength: 255 })),
    description: Type.Optional(Type.String({ maxLength: 2000 })),
    inputSchema: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
    outputSchema: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
    url: Type.Optional(Type.String({ maxLength: 2048 })),
    httpMethod: Type.Optional(HttpMethod),
    timeoutMs: Type.Optional(Type.Integer({ minimum: 100, maximum: 30000 })),
    authType: Type.Optional(AuthType),
    authHeaderName: Type.Optional(Type.String({ maxLength: 255 })),
    credential: Type.Optional(Type.String({ minLength: 1 })),
  },
  { additionalProperties: false },
);
export type UpdateToolBodyType = Static<typeof UpdateToolBody>;

const PaginationQuery = Type.Object({
  page: Type.Optional(Type.Integer({ minimum: 1, default: 1 })),
  limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100, default: 20 })),
});
export type PaginationQueryType = Static<typeof PaginationQuery>;

export const createToolSchema = {
  description: "Register a new tool for a project",
  tags: ["tools"],
  security: [{ bearerAuth: [] }],
  params: ProjectToolParams,
  body: CreateToolBody,
  response: {
    201: ToolResponse,
  },
};

export const listToolsSchema = {
  description: "List all tools for a project",
  tags: ["tools"],
  security: [{ bearerAuth: [] }],
  params: ProjectToolParams,
  querystring: PaginationQuery,
  response: {
    200: Type.Object({
      tools: Type.Array(ToolResponse),
      total: Type.Integer(),
      page: Type.Integer(),
      limit: Type.Integer(),
    }),
  },
};

export const getToolSchema = {
  description: "Get a tool by ID",
  tags: ["tools"],
  security: [{ bearerAuth: [] }],
  params: ToolParams,
  response: {
    200: ToolResponse,
  },
};

export const updateToolSchema = {
  description: "Update a tool definition or credential",
  tags: ["tools"],
  security: [{ bearerAuth: [] }],
  params: ToolParams,
  body: UpdateToolBody,
  response: {
    200: ToolResponse,
  },
};

export const deleteToolSchema = {
  description: "Delete a tool",
  tags: ["tools"],
  security: [{ bearerAuth: [] }],
  params: ToolParams,
  response: {
    200: Type.Object({ message: Type.String() }),
  },
};
