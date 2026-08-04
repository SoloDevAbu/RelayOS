import envSchema from "env-schema";
import { Type, type Static } from "@sinclair/typebox";

const schema = Type.Object({
  PORT: Type.Number({ default: 3001 }),
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
  DATABASE_URL: Type.String(),
  REDIS_URL: Type.String({ default: "redis://localhost:6379" }),
});

export type AppConfig = Static<typeof schema>;

export const config = envSchema<AppConfig>({
  schema,
  dotenv: { path: "../../.env" },
});
