import { defineConfig } from "drizzle-kit";
import dotenv from "dotenv";
import path from "path";
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const DATABASE_URL =
  process.env.DATABASE_URL ||
  "postgresql://postgres:postgres@localhost:5432/postgres";
const isNeon = DATABASE_URL.includes("neon.tech");

export default defineConfig({
  out: "./drizzle",
  schema: "./src/schema/index.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: DATABASE_URL,
    ...(isNeon ? { ssl: true } : {}),
  },
});
