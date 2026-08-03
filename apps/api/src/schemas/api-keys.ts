import { Type, type Static } from "@sinclair/typebox";

const ProjectParams = Type.Object({
  projectId: Type.String({ format: "uuid" }),
});

export const CreateApiKeyBody = Type.Object(
  {
    name: Type.String({ minLength: 1, maxLength: 255 }),
  },
  { additionalProperties: false },
);
export type CreateApiKeyBodyType = Static<typeof CreateApiKeyBody>;

/**
 * Returned only on creation — includes the raw key.
 * The raw key is NEVER returned again.
 */
export const ApiKeyCreatedResponse = Type.Object({
  id: Type.String({ format: "uuid" }),
  name: Type.String(),
  keyPrefix: Type.String(),
  /** Full raw key — shown ONCE, store securely. */
  key: Type.String(),
  createdAt: Type.String({ format: "date-time" }),
});

export const createApiKeySchema = {
  description:
    "Create a new API key for the project. The raw key is returned only once.",
  tags: ["api-keys"],
  security: [{ bearerAuth: [] }],
  params: ProjectParams,
  body: CreateApiKeyBody,
  response: {
    201: ApiKeyCreatedResponse,
  },
};

export const ApiKeyResponse = Type.Object({
  id: Type.String({ format: "uuid" }),
  name: Type.String(),
  keyPrefix: Type.String(),
  lastUsedAt: Type.Union([Type.String({ format: "date-time" }), Type.Null()]),
  revokedAt: Type.Union([Type.String({ format: "date-time" }), Type.Null()]),
  createdAt: Type.String({ format: "date-time" }),
});
export type ApiKeyResponseType = Static<typeof ApiKeyResponse>;

export const listApiKeysSchema = {
  description: "List all API keys for a project (raw key never returned)",
  tags: ["api-keys"],
  security: [{ bearerAuth: [] }],
  params: ProjectParams,
  response: {
    200: Type.Object({
      apiKeys: Type.Array(ApiKeyResponse),
      total: Type.Integer(),
    }),
  },
};

const ApiKeyParams = Type.Object({
  projectId: Type.String({ format: "uuid" }),
  keyId: Type.String({ format: "uuid" }),
});
export type ApiKeyParamsType = Static<typeof ApiKeyParams>;

export const revokeApiKeySchema = {
  description: "Revoke an API key permanently",
  tags: ["api-keys"],
  security: [{ bearerAuth: [] }],
  params: ApiKeyParams,
  response: {
    200: Type.Object({ message: Type.String() }),
  },
};
