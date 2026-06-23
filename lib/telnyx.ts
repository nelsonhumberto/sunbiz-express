import 'server-only';

const TELNYX_BASE = 'https://api.telnyx.com/v2';

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
