import pino from "pino";
import { nodeEnv } from "./config";

/**
 * Log level based on environment
 */
const level = nodeEnv === "development" ? "debug" : "info";

const redact = {
  paths: [
    "req.headers.authorization",
    "req.headers['x-api-key']",
    "headers.authorization",
    "headers['x-api-key']",
    "apiKey",
    "secret",
    "password",
  ],
  remove: true,
};

/**
 * Pretty print in development
 */

const transport =
  nodeEnv === "development"
    ? {
        target: "pino-pretty",
        options: {
          colorize: true,
          translateTime: "SYS:standard",
          ignore: "pid,hostname",
        },
      }
    : undefined;

/**
 * Logger instance
 */
export const logger = pino({
  level,
  redact,
  ...(transport ? { transport } : {}),
});

/**
 * Helper to create child logger with context
 */
export const createLogger = (context: Record<string, unknown>) => {
  return logger.child(context);
};
