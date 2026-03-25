/**
 * AES-256-GCM encryption for sensitive data (GPS trip points).
 * Mirrors server/lib/crypto.ts CryptoService — same algorithm, format, and key derivation.
 *
 * The encryption key is read from GPS_ENCRYPTION_KEY env var (Firebase config or .env).
 * If the key is not set, encryption is skipped with a warning log.
 */
import { createCipheriv, createDecipheriv, randomBytes, pbkdf2Sync } from 'crypto';
import * as functions from 'firebase-functions';

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;
const IV_LENGTH = 12;
const SALT_LENGTH = 32;
const TAG_LENGTH = 16;

function deriveKey(password: string, salt: Buffer): Buffer {
  return pbkdf2Sync(password, salt, 100000, KEY_LENGTH, 'sha256');
}

export function encryptData(text: string, password: string): string {
  const salt = randomBytes(SALT_LENGTH);
  const key = deriveKey(password, salt);
  const iv = randomBytes(IV_LENGTH);

  const cipher = createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const tag = cipher.getAuthTag();

  const combined = Buffer.concat([salt, iv, tag, Buffer.from(encrypted, 'hex')]);
  return combined.toString('base64');
}

export function decryptData(encryptedData: string, password: string): string {
  const combined = Buffer.from(encryptedData, 'base64');

  const salt = combined.subarray(0, SALT_LENGTH);
  const iv = combined.subarray(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
  const tag = combined.subarray(SALT_LENGTH + IV_LENGTH, SALT_LENGTH + IV_LENGTH + TAG_LENGTH);
  const encrypted = combined.subarray(SALT_LENGTH + IV_LENGTH + TAG_LENGTH);

  const key = deriveKey(password, salt);

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  let decrypted = decipher.update(encrypted, undefined, 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

/**
 * Get encryption key from environment. Returns null if not configured.
 */
export function getEncryptionKey(): string | null {
  const key = functions.config().encryption?.key || process.env.GPS_ENCRYPTION_KEY;
  if (!key) {
    functions.logger.warn(
      '[security] GPS_ENCRYPTION_KEY not set — tripPoints will be stored unencrypted. ' +
      'Set this key before handling real user data.'
    );
    return null;
  }
  return key;
}
