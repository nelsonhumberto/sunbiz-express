import 'server-only';

import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';

/** httpOnly cookie that proves this browser may continue one chat. */
export const ASSISTANT_CHAT_COOKIE = 'LF_CHAT';

/**
 * Conversation id the widget should echo on the next turn.
 * The signature stays in the cookie. This header is only the id.
 */
export const ASSISTANT_CONVERSATION_HEADER = 'x-assistant-conversation-id';

const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;
const DEV_CHAT_SECRET = 'launchforma-dev-assistant-chat';

/** Server-issued ids and the ids already stored on AssistantConversation. */
const ID_RE = /^[A-Za-z0-9_-]{8,80}$/;

function signingSecret(): string {
  const secret = process.env.NEXTAUTH_SECRET?.trim() || process.env.AUTH_SECRET?.trim();
  if (secret) return secret;
  if (process.env.NODE_ENV !== 'production') return DEV_CHAT_SECRET;
  throw new Error('NEXTAUTH_SECRET or AUTH_SECRET is required to sign the chat cookie.');
}

export function isAssistantConversationId(value: string): boolean {
  return ID_RE.test(value);
}

/** Ignore a missing or client-minted id that is not a safe token. */
export function sanitizeAssistantConversationId(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const id = raw.trim();
  if (!isAssistantConversationId(id)) return null;
  return id;
}

export function newAssistantConversationId(): string {
  return randomUUID();
}

export function signAssistantConversationId(id: string): string {
  const mac = createHmac('sha256', signingSecret()).update(`v1.${id}`).digest('base64url');
  return `v1.${id}.${mac}`;
}

/** Conversation id inside a cookie, or null when the cookie is missing or tampered. */
export function readAssistantConversationId(token: string | undefined | null): string | null {
  if (!token || token.length > 400) return null;
  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== 'v1') return null;
  const id = parts[1] ?? '';
  if (!isAssistantConversationId(id)) return null;
  const expected = signAssistantConversationId(id);
  const left = Buffer.from(token);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) return null;
  return id;
}

export function assistantChatSetCookie(id: string): string {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${ASSISTANT_CHAT_COOKIE}=${signAssistantConversationId(id)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${COOKIE_MAX_AGE_SECONDS}${secure}`;
}

/** Copy the stream response and attach the chat cookie plus the id header. */
export function attachAssistantSession(response: Response, conversationId: string): Response {
  const headers = new Headers(response.headers);
  headers.set(ASSISTANT_CONVERSATION_HEADER, conversationId);
  const prior =
    typeof response.headers.getSetCookie === 'function' ? response.headers.getSetCookie() : [];
  headers.delete('set-cookie');
  for (const cookie of prior) headers.append('set-cookie', cookie);
  headers.append('set-cookie', assistantChatSetCookie(conversationId));
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
