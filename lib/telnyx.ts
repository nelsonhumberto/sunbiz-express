import 'server-only';

import { createPublicKey, verify as cryptoVerify } from 'node:crypto';

const TELNYX_BASE = 'https://api.telnyx.com/v2';

// DER SPKI prefix for an Ed25519 public key (RFC 8410). Prepending this to the
// raw 32-byte key lets Node build a usable public key object.
const ED25519_SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');

/** True when a Telnyx webhook public key is configured for verification. */
export function telnyxPublicKeyConfigured(): boolean {
  return !!process.env.TELNYX_PUBLIC_KEY?.trim();
}

/**
 * Verify a Telnyx webhook's Ed25519 signature.
 *
 * Telnyx signs `${timestamp}|${rawBody}` and sends the base64 signature in the
 * `telnyx-signature-ed25519` header plus the unix `telnyx-timestamp`. The
 * account's base64 public key lives in `TELNYX_PUBLIC_KEY`. We also enforce a
 * timestamp tolerance to block replay.
 */
export function verifyTelnyxSignature(args: {
  rawBody: string;
  signatureB64: string | null;
  timestamp: string | null;
  toleranceSeconds?: number;
}): boolean {
  const pub = process.env.TELNYX_PUBLIC_KEY?.trim();
  if (!pub || !args.signatureB64 || !args.timestamp) return false;

  // Replay window.
  const ts = Number(args.timestamp);
  const tolerance = args.toleranceSeconds ?? 5 * 60;
  if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > tolerance) return false;

  let rawKey: Buffer;
  try {
    rawKey = Buffer.from(pub, 'base64');
  } catch {
    return false;
  }
  if (rawKey.length !== 32) return false;

  try {
    const key = createPublicKey({
      key: Buffer.concat([ED25519_SPKI_PREFIX, rawKey]),
      format: 'der',
      type: 'spki',
    });
    const signed = Buffer.from(`${args.timestamp}|${args.rawBody}`, 'utf8');
    const sig = Buffer.from(args.signatureB64, 'base64');
    return cryptoVerify(null, signed, key, sig);
  } catch {
    return false;
  }
}

export interface SendFaxInput {
  to: string;
  from: string;
  mediaUrl: string;
  connectionId: string;
}

export interface SendFaxResult {
  id: string; // Telnyx fax id
  status: string;
}

export class TelnyxError extends Error {
  constructor(message: string, public readonly detail?: unknown) {
    super(message);
    this.name = 'TelnyxError';
  }
}

function apiKey(): string {
  const key = process.env.TELNYX_API_KEY?.trim();
  if (!key) throw new TelnyxError('TELNYX_API_KEY is not set.');
  return key;
}

/** Send an outbound fax. The PDF must be reachable by Telnyx at `mediaUrl`. */
export async function telnyxSendFax(input: SendFaxInput): Promise<SendFaxResult> {
  const res = await fetch(`${TELNYX_BASE}/faxes`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      connection_id: input.connectionId,
      to: input.to,
      from: input.from,
      media_url: input.mediaUrl,
    }),
    cache: 'no-store',
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg =
      body?.errors?.[0]?.detail ||
      body?.errors?.[0]?.title ||
      `Telnyx returned HTTP ${res.status}`;
    throw new TelnyxError(msg, body?.errors);
  }
  return { id: body?.data?.id ?? '', status: body?.data?.status ?? 'queued' };
}

/** E.164-ish normalization for US fax numbers entered by an admin. */
export function normalizeFaxNumber(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith('+')) return '+' + trimmed.slice(1).replace(/\D/g, '');
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return `+${digits}`;
}
