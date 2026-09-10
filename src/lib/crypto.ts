import 'server-only';

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';

import { getEnv } from './env';

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;

function encryptionKey(): Buffer {
  const raw = getEnv().INVITE_ENCRYPTION_KEY;
  // Accept either a 32-byte base64 key or an arbitrary passphrase, which is
  // stretched to 32 bytes with SHA-256.
  const decoded = Buffer.from(raw, 'base64');
  if (decoded.length === 32) return decoded;
  return createHash('sha256').update(raw, 'utf8').digest();
}

/** URL-safe random token. 32 bytes of entropy is well past guessable. */
export function generateToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

/** Deterministic hash used as the invite lookup key. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export function constantTimeEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/** `iv.ciphertext.authTag`, each part base64url encoded. */
export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString('base64url'), encrypted.toString('base64url'), tag.toString('base64url')].join(
    '.',
  );
}

/**
 * Returns null rather than throwing when the ciphertext is unreadable, so a
 * rotated key degrades to "regenerate the invite link" instead of a 500.
 */
export function decryptSecret(payload: string): string | null {
  const parts = payload.split('.');
  if (parts.length !== 3) return null;
  const [ivPart, dataPart, tagPart] = parts as [string, string, string];

  try {
    const decipher = createDecipheriv(
      ALGORITHM,
      encryptionKey(),
      Buffer.from(ivPart, 'base64url'),
    );
    decipher.setAuthTag(Buffer.from(tagPart, 'base64url'));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(dataPart, 'base64url')),
      decipher.final(),
    ]);
    return decrypted.toString('utf8');
  } catch {
    return null;
  }
}
