import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const KEY_LENGTH = 32;

/**
 * Derive a 32-byte key from JWT_SECRET (or ZALO_SESSION_SECRET if provided).
 * Uses SHA-256 hash to ensure consistent key length.
 */
function deriveKey(secret: string): Buffer {
  return crypto.createHash('sha256').update(secret).digest();
}

function getSecret(): string {
  const secret = process.env.ZALO_SESSION_SECRET || process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET or ZALO_SESSION_SECRET must be set for session encryption');
  return secret;
}

/**
 * Encrypt session data (e.g. Zalo login cookies / credentials JSON) using AES-256-GCM.
 * @returns base64 string containing iv + authTag + ciphertext
 */
export function encryptSessionData(plaintext: string): string {
  const key = deriveKey(getSecret());
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  // Pack: iv (12) + authTag (16) + ciphertext
  const packed = Buffer.concat([iv, authTag, encrypted]);
  return packed.toString('base64');
}

/**
 * Decrypt session data encrypted with encryptSessionData.
 */
export function decryptSessionData(b64: string): string {
  const key = deriveKey(getSecret());
  const packed = Buffer.from(b64, 'base64');
  if (packed.length < IV_LENGTH + AUTH_TAG_LENGTH) {
    throw new Error('Invalid encrypted session data: too short');
  }
  const iv = packed.subarray(0, IV_LENGTH);
  const authTag = packed.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = packed.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return decrypted.toString('utf8');
}

/**
 * Helper: encrypt an object as JSON.
 */
export function encryptJson(obj: unknown): string {
  return encryptSessionData(JSON.stringify(obj));
}

/**
 * Helper: decrypt to object.
 */
export function decryptJson<T = unknown>(b64: string): T {
  return JSON.parse(decryptSessionData(b64)) as T;
}
