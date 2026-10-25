import 'server-only';

import { cookies } from 'next/headers';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import {
  ASSISTANT_MESSAGE_RATE_WINDOW_MS,
  ASSISTANT_NEW_CONVERSATION_WINDOW_MS,
  allowNewAssistantConversation,
  assistantMaxNewConversationsPerHour,
  assistantMaxNewConversationsPerIp,
  assistantMaxTurnsPerConversation,
  assistantMaxUserMessagesPerMinute,
  conversationOwnedBy,
} from '@/lib/assistant/limits';
import { assistantLimitResponse } from '@/lib/assistant/limit-reply';
import {
  ASSISTANT_CHAT_COOKIE,
  attachAssistantSession,
  newAssistantConversationId,
  readAssistantConversationId,
  sanitizeAssistantConversationId,
} from '@/lib/assistant/chat-cookie';
import type { AssistantActor } from '@/lib/assistant/tools';

type ConversationRow = {
  id: string;
  actorId: string | null;
  actorKind: string | null;
  filingId: string | null;
};

export type PreparedAssistantTurn =
  | { kind: 'ready'; conversationId: string }
  | { kind: 'deny'; response: Response };

const PROBLEM = 'The assistant had a problem. Please try again.';
const TOO_FAST = 'You are sending messages too quickly. Please wait a moment.';

function problemResponse(): Response {
  return Response.json({ error: PROBLEM }, { status: 500 });
}

function tooFastResponse(): Response {
  return Response.json({ error: TOO_FAST }, { status: 429 });
}

function logNewConversationCap(layer: string) {
  logger.info('new conversation cap', { area: 'assistant', tag: 'cap', layer });
}

/**
 * Cookie match, or the logged-in / guest user on the row.
 * Anonymous rows have a null actorId, so only the signed cookie owns them.
 */
function callerOwns(
  row: { id: string; actorId: string | null; actorKind: string | null },
  actor: AssistantActor | null,
  cookieId: string | null,
): boolean {
  if (cookieId && cookieId === row.id) return true;
  return conversationOwnedBy(row, actor);
}

function readCookieId(): string | null {
  const token = cookies().get(ASSISTANT_CHAT_COOKIE)?.value;
  return readAssistantConversationId(token);
}

async function loadConversation(id: string): Promise<ConversationRow | null> {
  return prisma.assistantConversation.findUnique({
    where: { id },
    select: { id: true, actorId: true, actorKind: true, filingId: true },
  });
}

async function conversationsSince(since: Date, actorId?: string): Promise<number> {
  return prisma.assistantConversation.count({
    where: {
      createdAt: { gte: since },
      ...(actorId ? { actorId } : {}),
    },
  });
}

async function userMessagesSince(since: Date): Promise<number> {
  return prisma.assistantMessage.count({
    where: { role: 'user', createdAt: { gte: since } },
  });
}

/**
 * Open a server-assigned conversation. The client id is never used as the
 * row id. A refusal does not set the chat cookie, so the next request cannot
 * continue an orphan row and skip the ceiling.
 */
async function openFresh(opts: {
  actor: AssistantActor | null;
  locale: string;
  ip: string;
}): Promise<{ ok: true; row: ConversationRow } | { ok: false }> {
  const id = newAssistantConversationId();
  if (!allowNewAssistantConversation(opts.ip, id)) {
    logNewConversationCap('memory');
    return { ok: false };
  }

  const since = new Date(Date.now() - ASSISTANT_NEW_CONVERSATION_WINDOW_MS);
  const hourCap = assistantMaxNewConversationsPerHour();
  const actorCap = assistantMaxNewConversationsPerIp();
  const globalBefore = await conversationsSince(since);
  if (globalBefore >= hourCap) {
    logNewConversationCap('global');
    return { ok: false };
  }
  if (opts.actor) {
    const actorBefore = await conversationsSince(since, opts.actor.id);
    if (actorBefore >= actorCap) {
      logNewConversationCap('actor');
      return { ok: false };
    }
  }

  const row = await prisma.assistantConversation.create({
    data: {
      id,
      actorId: opts.actor?.id ?? null,
      actorKind: opts.actor?.kind ?? null,
      filingId: null,
      locale: opts.locale,
    },
    select: { id: true, actorId: true, actorKind: true, filingId: true },
  });

  const globalAfter = await conversationsSince(since);
  if (globalAfter > hourCap) {
    logNewConversationCap('global');
    return { ok: false };
  }
  if (opts.actor) {
    const actorAfter = await conversationsSince(since, opts.actor.id);
    if (actorAfter > actorCap) {
      logNewConversationCap('actor');
      return { ok: false };
    }
  }
  return { ok: true, row };
}

/**
 * Lock the conversation, then insert the user turn only when it is still
 * under the cap. The insert commits before the model is called, so an abort
 * or a stream error still counts. Parallel requests on the same id serialize
 * on the row lock. A recount after the insert refuses the model if a race
 * crossed the cap.
 */
async function reserveUserTurn(
  conversationId: string,
  content: string,
): Promise<'ok' | 'capped' | 'rate'> {
  const cap = assistantMaxTurnsPerConversation();
  const minuteAgo = new Date(Date.now() - ASSISTANT_MESSAGE_RATE_WINDOW_MS);
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "AssistantConversation" WHERE "id" = ${conversationId} FOR UPDATE`;
    const before = await tx.assistantMessage.count({
      where: { conversationId, role: 'user' },
    });
    if (before >= cap) return 'capped' as const;
    await tx.assistantMessage.create({
      data: { conversationId, role: 'user', content },
    });
    const after = await tx.assistantMessage.count({
      where: { conversationId, role: 'user' },
    });
    if (after > cap) return 'capped' as const;
    const recent = await tx.assistantMessage.count({
      where: { role: 'user', createdAt: { gte: minuteAgo } },
    });
    if (recent > assistantMaxUserMessagesPerMinute()) return 'rate' as const;
    return 'ok' as const;
  });
}

/**
 * Choose the conversation this caller may use, store the user turn, and
 * either hand back that id or a response that does not call the model.
 *
 * A missing id and an id that is not in the database are ignored. The signed
 * cookie, then a new server id, decides the row. An id that exists and is
 * not owned is never written: no model call for that row, no message, no
 * filingId change. A fresh server conversation is started instead, still
 * subject to the new-conversation caps.
 */
export async function prepareAssistantTurn(opts: {
  requestedId: unknown;
  actor: AssistantActor | null;
  locale: string;
  ip: string;
  userText: string;
}): Promise<PreparedAssistantTurn> {
  try {
    const minuteAgo = new Date(Date.now() - ASSISTANT_MESSAGE_RATE_WINDOW_MS);
    const recentMessages = await userMessagesSince(minuteAgo);
    if (recentMessages >= assistantMaxUserMessagesPerMinute()) {
      logger.info('assistant message rate cap', { area: 'assistant', tag: 'cap' });
      return { kind: 'deny', response: tooFastResponse() };
    }

    const requested = sanitizeAssistantConversationId(opts.requestedId);
    const cookieId = readCookieId();

    let conversation: ConversationRow | null = null;
    let forceFresh = false;

    if (requested) {
      const row = await loadConversation(requested);
      if (row && callerOwns(row, opts.actor, cookieId)) conversation = row;
      else if (row) forceFresh = true;
    }

    if (!conversation && !forceFresh && cookieId && cookieId !== requested) {
      const row = await loadConversation(cookieId);
      if (row && callerOwns(row, opts.actor, cookieId)) conversation = row;
    }

    if (!conversation) {
      const opened = await openFresh({ actor: opts.actor, locale: opts.locale, ip: opts.ip });
      if (!opened.ok) {
        return { kind: 'deny', response: assistantLimitResponse(opts.locale) };
      }
      conversation = opened.row;
    }

    const reserved = await reserveUserTurn(conversation.id, opts.userText);
    if (reserved === 'capped') {
      logger.info('assistant turn cap', { area: 'assistant', tag: 'cap' });
      return {
        kind: 'deny',
        response: attachAssistantSession(assistantLimitResponse(opts.locale), conversation.id),
      };
    }
    if (reserved === 'rate') {
      logger.info('assistant message rate cap', { area: 'assistant', tag: 'cap' });
      return {
        kind: 'deny',
        response: attachAssistantSession(tooFastResponse(), conversation.id),
      };
    }
    return { kind: 'ready', conversationId: conversation.id };
  } catch (err) {
    logger.error('assistant conversation cap lookup failed', { area: 'assistant', tag: 'cap' }, err);
    return { kind: 'deny', response: problemResponse() };
  }
}
