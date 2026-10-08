import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export function mfaEncryptionKey(value: string | undefined): Buffer | null {
  if (!value || !/^[A-Za-z0-9+/]{43}=$/.test(value)) return null;
  const key = Buffer.from(value, "base64");
  return key.length === 32 && key.toString("base64") === value ? key : null;
}
export function encryptMfaSecret(secret: string, key: Buffer, userId: string, keyId: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(`LedgerApp-platform-TOTP:${userId}:${keyId}`));
  const encrypted = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map((part) => part.toString("base64url")).join(".");
}
export function decryptMfaSecret(value: string, key: Buffer, userId: string, keyId: string) {
  const parts = value.split(".");
  if (parts.length !== 3) throw new Error("Invalid encrypted MFA credential");
  const [iv, tag, encrypted] = parts.map((part) => Buffer.from(part, "base64url"));
  if (iv.length !== 12 || tag.length !== 16) throw new Error("Invalid encrypted MFA credential");
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAAD(Buffer.from(`LedgerApp-platform-TOTP:${userId}:${keyId}`));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}
