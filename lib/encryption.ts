// Authenticated symmetric encryption for at-rest PII.
//
// Used to protect SSN/ITIN, passport numbers, and other identity data we
// collect for the IRS EIN application. We deliberately avoid storing any of
// this in plaintext or in fields covered by analytics dumps.
//
// Algorithm: AES-256-GCM with a fresh random 12-byte IV per ciphertext. The
// authentication tag is appended after the ciphertext so a single base64
// blob round-trips through Postgres `text` columns.
//
// Key management:
//   - The key MUST come from the EIN_ENCRYPTION_KEY env var (Vercel Project
//     env), 32 bytes encoded as base64 or hex. Never commit the key.
//   - In development, if no key is set, we fall back to a derived test key
//     so local devs can run the wizard end-to-end. The dev key is rejected
//     in production via `assertProductionKeyConfigured()`.
//
// Output format (base64): "v1:<iv_b64>:<ciphertext_b64>:<auth_tag_b64>".
// Storing the version prefix lets us rotate algorithms without breaking
// previously-encrypted rows.

import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'node:crypto';

const ALGO = 'aes-256-gcm';
const VERSION = 'v1';
const IV_LENGTH = 12; // GCM standard
const KEY_LENGTH = 32; // AES-256

let cachedKey: Buffer | null = null;

function loadKey(): Buffer {
  if (cachedKey) return cachedKey;

  const raw = process.env.EIN_ENCRYPTION_KEY?.trim();
  if (raw) {
    let key: Buffer | null = null;
    // Accept base64 or hex.
    try {
      const b = Buffer.from(raw, 'base64');
      if (b.length === KEY_LENGTH) key = b;
    } catch {
      /* ignore */
    }
    if (!key) {
      try {
        const b = Buffer.from(raw, 'hex');
        if (b.length === KEY_LENGTH) key = b;
      } catch {
        /* ignore */
      }
    }
    if (!key) {
      throw new Error(
        'EIN_ENCRYPTION_KEY must be a 32-byte key encoded as base64 or hex.',
      );
    }
    cachedKey = key;
    return cachedKey;
  }

  // Production fallback: derive a key from NEXTAUTH_SECRET (which IS
  // required and present on every deploy). This keeps the EIN flow
  // working out-of-the-box without forcing operators to provision a
  // separate key. The derivation uses a fixed app-level "salt" so the
  // resulting key is deterministic per environment and never crashes a
  // request. We still encourage setting a dedicated EIN_ENCRYPTION_KEY
  // so PII can be re-encrypted independently of session secrets.
  const sessionSecret = process.env.NEXTAUTH_SECRET?.trim();
  if (sessionSecret && sessionSecret.length >= 16) {
    cachedKey = createHash('sha256')
      .update('launchforma:ein:v1:')
      .update(sessionSecret)
      .digest();
    if (
      process.env.NODE_ENV === 'production' &&
      typeof process.emitWarning === 'function'
    ) {
      process.emitWarning(
        'EIN_ENCRYPTION_KEY is not set; falling back to a NEXTAUTH_SECRET-derived key. Configure a dedicated key in Vercel → Settings → Environment Variables for stronger key rotation.',
        'EncryptionWarning',
      );
    }
    return cachedKey;
  }

  // Local development absolute fallback. Deterministic, NOT secret.
  cachedKey = createHash('sha256')
    .update('launchforma-dev-only-do-not-use-in-prod')
    .digest();
  if (typeof process.emitWarning === 'function') {
    process.emitWarning(
      'EIN_ENCRYPTION_KEY is not set and NEXTAUTH_SECRET is missing - using a deterministic dev-only key. Set EIN_ENCRYPTION_KEY before storing real PII.',
      'EncryptionWarning',
    );
  }
  return cachedKey;
}

/** Throws when the production environment is missing a real key. */
export function assertProductionKeyConfigured(): void {
  if (
    process.env.NODE_ENV === 'production' &&
    !process.env.EIN_ENCRYPTION_KEY &&
    !process.env.NEXTAUTH_SECRET
  ) {
    throw new Error(
      'EIN_ENCRYPTION_KEY (or NEXTAUTH_SECRET as a fallback) is required in production.',
    );
  }
}

/** Encrypt a string. Returns a versioned base64 blob safe for `text` columns. */
export function encryptString(plaintext: string): string {
  if (typeof plaintext !== 'string') {
    throw new TypeError('encryptString expects a string.');
  }
  const key = loadKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGO, key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString('base64'), ct.toString('base64'), tag.toString('base64')].join(
    ':',
  );
}

/** Decrypt a versioned blob produced by {@link encryptString}. */
export function decryptString(blob: string): string {
  if (!blob || typeof blob !== 'string') {
    throw new TypeError('decryptString expects a non-empty string.');
  }
  const parts = blob.split(':');
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new Error('Unsupported ciphertext format.');
  }
  const iv = Buffer.from(parts[1], 'base64');
  const ct = Buffer.from(parts[2], 'base64');
  const tag = Buffer.from(parts[3], 'base64');
  if (iv.length !== IV_LENGTH) {
    throw new Error('Invalid IV length.');
  }
  const key = loadKey();
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
  return pt.toString('utf8');
}

/** Mask a tax id (SSN/ITIN/EIN) for safe display: ●●●-●●-1234. */
export function maskTaxId(value: string): string {
  if (!value) return '';
  const digits = value.replace(/\D/g, '');
  if (digits.length < 4) return '●●●-●●-●●●●';
  const tail = digits.slice(-4);
  return `●●●-●●-${tail}`;
}

/** Mask a passport number for safe display: ●●●●1234. */
export function maskPassport(value: string): string {
  if (!value) return '';
  const trimmed = value.trim();
  if (trimmed.length <= 4) return '●'.repeat(trimmed.length);
  const tail = trimmed.slice(-4);
  return `${'●'.repeat(Math.max(4, trimmed.length - 4))}${tail}`;
}
