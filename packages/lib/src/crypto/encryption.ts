import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const KEY_BYTE_LENGTH = 32;

function parseKey(masterKey: string): Buffer {
  const buf = Buffer.from(masterKey, "hex");
  if (buf.length !== KEY_BYTE_LENGTH) {
    throw new Error(
      `ENCRYPTION_MASTER_KEY must be ${KEY_BYTE_LENGTH * 2} hex characters (${KEY_BYTE_LENGTH} bytes)`,
    );
  }
  return buf;
}

/**
 * Encrypts plaintext with AES-256-GCM.
 * Returns a colon-delimited string: `<iv_hex>:<authTag_hex>:<ciphertext_hex>`.
 */
export function encrypt(plaintext: string, masterKey: string): string {
  const key = parseKey(masterKey);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted.toString("hex")}`;
}

/**
 * Decrypts a value produced by `encrypt`.
 * Throws if the ciphertext is malformed or the key is wrong.
 */
export function decrypt(ciphertext: string, masterKey: string): string {
  const key = parseKey(masterKey);
  const parts = ciphertext.split(":");
  if (parts.length !== 3) {
    throw new Error("Invalid ciphertext format — expected iv:authTag:data");
  }
  const [ivHex, authTagHex, dataHex] = parts as [string, string, string];
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");
  const data = Buffer.from(dataHex, "hex");

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  return decipher.update(data) + decipher.final("utf8");
}
