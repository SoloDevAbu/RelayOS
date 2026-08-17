import { eq } from "drizzle-orm";
import { db } from "@relayos/db/client";
import { toolDefinitions } from "@relayos/db/schema";

export type ToolRecord = typeof toolDefinitions.$inferSelect;

/**
 * Loads a tool's configuration by ID directly from the database.
 * Direct DB access avoids an HTTP round-trip to platform-api — same pattern
 * workflow-service already uses to read workflows.
 */
export async function loadTool(toolId: string): Promise<ToolRecord> {
  const [tool] = await db
    .select()
    .from(toolDefinitions)
    .where(eq(toolDefinitions.id, toolId))
    .limit(1);

  if (!tool) {
    throw new Error(`Tool "${toolId}" not found`);
  }

  return tool;
}
