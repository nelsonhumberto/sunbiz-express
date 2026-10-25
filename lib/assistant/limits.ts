import { rateLimit } from '@/lib/rate-limit';

/**
 * Per-step output cap for streamText.
 *
 * @ai-sdk/deepseek forwards maxOutputTokens as DeepSeek max_tokens and does
 * not set a separate reasoning budget. deepseek-v4-pro thinks by default
 * (reasoning_effort high). Reasoning tokens are part of the completion:
 * the provider reports them as outputTokens.reasoning and subtracts them
 * from completion_tokens to get text tokens, so they count toward max_tokens.
 * DeepSeek's own unset default is 64K in thinking mode (8K with thinking off).
 *
 * 1500 is too tight for that default. Published sweeps of deepseek-v4-pro at
 * high effort returned an empty answer at 2048 tokens and a finished answer
 * at 3072, and the model spends more of a larger budget on reasoning.
 * 4096 leaves room for a high-effort thought plus a short answer or a tool
 * call, and is still far under the 64K thinking default. Each streamText
 * step gets this budget. stopWhen stays stepCountIs(6).
 */
export const DEFAULT_ASSISTANT_MAX_OUTPUT_TOKENS = 4096;

/** Prior stored user turns allowed on one owned conversation. */
export const DEFAULT_ASSISTANT_MAX_TURNS_PER_CONVERSATION = 20;

/**
 * New conversation ids accepted per IP per window. The chat widget mints a
 * new id on each mount, so this has to allow a few refreshes, while stopping
 * a client from rotating ids to dodge the turn cap.
 */
export const DEFAULT_ASSISTANT_MAX_NEW_CONVERSATIONS_PER_IP = 12;

/** Fixed window for the new-conversation limiter. In-memory, per instance. */
export const ASSISTANT_NEW_CONVERSATION_WINDOW_MS = 60 * 60 * 1000;

const recentNewConversationIds = new Map<string, number>();

function readPositiveInt(raw: string | undefined, fallback: number): number {
  if (raw == null) return fallback;
  const trimmed = raw.trim();
  if (!trimmed) return fallback;
  const value = Number(trimmed);
  if (!Number.isInteger(value) || value < 1) return fallback;
  return value;
}

export function assistantMaxOutputTokens(): number {
  return readPositiveInt(
    process.env.ASSISTANT_MAX_OUTPUT_TOKENS,
    DEFAULT_ASSISTANT_MAX_OUTPUT_TOKENS,
  );
}

export function assistantMaxTurnsPerConversation(): number {
  return readPositiveInt(
    process.env.ASSISTANT_MAX_TURNS_PER_CONVERSATION,
    DEFAULT_ASSISTANT_MAX_TURNS_PER_CONVERSATION,
  );
}

export function assistantMaxNewConversationsPerIp(): number {
  return readPositiveInt(
    process.env.ASSISTANT_MAX_NEW_CONVERSATIONS_PER_IP,
    DEFAULT_ASSISTANT_MAX_NEW_CONVERSATIONS_PER_IP,
  );
}

export function conversationOwnedBy(
  conversation: { actorId: string | null; actorKind: string | null },
  actor: { id: string; kind: string } | null,
): boolean {
  if (!actor || !conversation.actorId) return false;
  if (conversation.actorId !== actor.id) return false;
  if (conversation.actorKind && conversation.actorKind !== actor.kind) return false;
  return true;
}

function sweepRecentNewConversations(now: number) {
  if (recentNewConversationIds.size < 5000) return;
  for (const [key, expiresAt] of recentNewConversationIds) {
    if (expiresAt <= now) recentNewConversationIds.delete(key);
  }
}

/**
 * Allow a conversation id that is not in the database yet.
 * The same id from the same IP inside the window counts once, so a retry
 * does not burn another slot. A different id does.
 *
 * Limits: the bucket is in-memory on this server instance only. It resets
 * on a cold start and is not shared across instances. A request with no
 * conversation id is not a new conversation (the route does not create one).
 */
export function allowNewAssistantConversation(ip: string, conversationId: string): boolean {
  const now = Date.now();
  sweepRecentNewConversations(now);
  const dedupeKey = `${ip}:${conversationId}`;
  const seenUntil = recentNewConversationIds.get(dedupeKey);
  if (seenUntil && seenUntil > now) return true;

  const decision = rateLimit(
    `assistant-new-convo:${ip}`,
    assistantMaxNewConversationsPerIp(),
    ASSISTANT_NEW_CONVERSATION_WINDOW_MS,
  );
  if (!decision.ok) return false;
  recentNewConversationIds.set(dedupeKey, now + ASSISTANT_NEW_CONVERSATION_WINDOW_MS);
  return true;
}
