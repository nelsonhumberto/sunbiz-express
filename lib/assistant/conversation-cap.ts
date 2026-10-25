import 'server-only';

import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import {
  allowNewAssistantConversation,
  assistantMaxTurnsPerConversation,
  conversationOwnedBy,
} from '@/lib/assistant/limits';
import { assistantLimitResponse } from '@/lib/assistant/limit-reply';
import type { AssistantActor } from '@/lib/assistant/tools';

/**
 * Read-only guard. Returns a fixed reply when this actor's conversation is
 * over the turn cap, or when this IP is opening too many new conversations.
 * Returns null to continue to the model.
 *
 * A missing conversation id, a conversation owned by someone else, and a
 * failed lookup all continue (same as before this cap). The lookup is
 * read-only. The count is prior user rows, never a number from the client.
 */
export async function assistantConversationCapResponse(opts: {
  conversationId: string;
  actor: AssistantActor | null;
  locale: string;
  ip: string;
}): Promise<Response | null> {
  let conversation: {
    actorId: string | null;
    actorKind: string | null;
    _count: { messages: number };
  } | null;
  try {
    conversation = await prisma.assistantConversation.findUnique({
      where: { id: opts.conversationId },
      select: {
        actorId: true,
        actorKind: true,
        _count: {
          select: { messages: { where: { role: 'user' } } },
        },
      },
    });
  } catch (err) {
    logger.error(
      'assistant conversation cap lookup failed',
      { area: 'assistant', tag: 'cap' },
      err,
    );
    return null;
  }

  if (!conversation) {
    if (!allowNewAssistantConversation(opts.ip, opts.conversationId)) {
      logger.info('assistant new conversation cap', { area: 'assistant', tag: 'cap' });
      return assistantLimitResponse(opts.locale);
    }
    return null;
  }

  if (!conversationOwnedBy(conversation, opts.actor)) return null;

  if (conversation._count.messages >= assistantMaxTurnsPerConversation()) {
    logger.info('assistant turn cap', { area: 'assistant', tag: 'cap' });
    return assistantLimitResponse(opts.locale);
  }
  return null;
}
