import { eq } from "drizzle-orm";
import { db } from "@relayos/db/client";
import { toolCredentials } from "@relayos/db/schema";
import { decrypt } from "@relayos/lib/crypto";

/**
 * Fetches and decrypts the credential for a tool right before it is needed.
 * The decrypted value is returned as a plain string and never stored — it
 * exists only within the calling function's scope for the duration of one request.
 */
export async function getDecryptedCredential(
  toolId: string,
): Promise<string | undefined> {
  const masterKey = process.env.ENCRYPTION_MASTER_KEY;
  if (!masterKey) {
    throw new Error("ENCRYPTION_MASTER_KEY env var is not set");
  }

  const [row] = await db
    .select({ encryptedValue: toolCredentials.encryptedValue })
    .from(toolCredentials)
    .where(eq(toolCredentials.toolId, toolId))
    .limit(1);

  if (!row) return undefined;

  return decrypt(row.encryptedValue, masterKey);
}
