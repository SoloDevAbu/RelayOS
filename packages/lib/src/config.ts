function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`Missing required environment variable: ${key}`);
  return value;
}

export function getRedisUrl(): string {
  return requireEnv("REDIS_URL");
}

export const nodeEnv = process.env.NODE_ENV ?? "development";
