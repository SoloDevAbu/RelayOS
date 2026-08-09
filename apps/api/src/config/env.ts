import envSchema from "env-schema";
import { Type, type Static } from "@sinclair/typebox";

const schema = Type.Object({
  // Server
  PORT: Type.Number({ default: 3002 }),
  HOST: Type.String({ default: "0.0.0.0" }),
  NODE_ENV: Type.Union(
    [
      Type.Literal("development"),
      Type.Literal("production"),
      Type.Literal("test"),
    ],
    { default: "development" },
  ),
  LOG_LEVEL: Type.Union(
    [
      Type.Literal("trace"),
      Type.Literal("debug"),
      Type.Literal("info"),
      Type.Literal("warn"),
      Type.Literal("error"),
      Type.Literal("fatal"),
    ],
    { default: "info" },
  ),

  // Database
  DATABASE_URL: Type.String(),

  // Redis
  REDIS_URL: Type.String({ default: "redis://localhost:6379" }),

  // Auth
  JWT_SECRET: Type.String({ minLength: 16 }),
  JWT_ACCESS_TTL: Type.String({ default: "15m" }),
  JWT_REFRESH_TTL_DAYS: Type.Number({ default: 7 }),

  // CORS — comma-separated list of allowed origins
  CORS_ORIGINS: Type.String({ default: "http://localhost:3000" }),

  // Internal service communication
  WORKFLOW_SERVICE_URL: Type.String({ default: "http://localhost:3003" }),
  INTERNAL_SERVICE_SECRET: Type.String({ default: "local-dev-secret-change-this-in-production" }),
});

export type AppConfig = Static<typeof schema>;

/**
 * Validated app config — fails fast at startup if required env vars are missing.
 * Loaded once; import this object wherever config is needed outside of plugins.
 */
export const config = envSchema<AppConfig>({
  schema,
  dotenv: { path: "../../.env" },
});
