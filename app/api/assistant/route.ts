import { NextResponse } from 'next/server';
import {
  streamText,
  convertToModelMessages,
  stepCountIs,
  type UIMessage,
} from 'ai';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getWizardActor } from '@/lib/guest';
import { rateLimit, clientIp } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';
import {
  ACTIVE_FORMATION_STATES,
  type StateCode,
} from '@/lib/formation-states';
import type { EntityType } from '@/lib/pricing';
import { assistantModel, assistantConfigured } from '@/lib/assistant/provider';
import { buildKnowledge } from '@/lib/assistant/knowledge';
import { buildSystemPrompt } from '@/lib/assistant/system-prompt';
import { summarizeFiling } from '@/lib/assistant/redact';
import { buildAssistantTools, type AssistantActor } from '@/lib/assistant/tools';
import { assistantMaxOutputTokens } from '@/lib/assistant/limits';
import { prepareAssistantTurn } from '@/lib/assistant/conversation-cap';
import { attachAssistantSession } from '@/lib/assistant/chat-cookie';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

interface AssistantBody {
  messages: UIMessage[];
  filingId?: string;
  locale?: string;
  stateHint?: string;
  conversationId?: string;
}

/** Extract the plain text of a UIMessage (concatenated text parts). */
function messageText(m: UIMessage | undefined): string {
  if (!m) return '';
  const parts = (m.parts ?? []) as Array<{ type?: string; text?: string }>;
  return parts
    .filter((p) => p.type === 'text' && typeof p.text === 'string')
    .map((p) => p.text)
    .join('')
    .trim();
}

export async function POST(request: Request) {
  if (!assistantConfigured()) {
    return NextResponse.json(
      { error: 'The assistant is not configured yet (missing DEEPSEEK_API_KEY).' },
      { status: 503 },
    );
  }

  // Fast per-IP throttle. In-memory, per instance. A database count of recent
  // user messages is the cross-instance backstop inside prepareAssistantTurn.
  const ip = clientIp();
  const limit = rateLimit(`assistant:${ip}`, 30, 60 * 1000);
  if (!limit.ok) {
    return NextResponse.json(
      { error: 'You are sending messages too quickly. Please wait a moment.' },
      { status: 429 },
    );
  }

  let body: AssistantBody;
  try {
    body = (await request.json()) as AssistantBody;
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }
  if (!Array.isArray(body.messages)) {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  // Resolve the actor (auth user or guest cookie).
  const session = await auth();
  const resolved = await getWizardActor(session?.user?.id, session?.user?.email);
  const actor: AssistantActor | null = resolved
    ? { kind: resolved.kind, id: resolved.id, email: resolved.email }
    : null;

  const locale = body.locale === 'es' ? 'es' : 'en';
  const recent = body.messages.slice(-20);
  const lastUserText = messageText([...recent].reverse().find((m) => m.role === 'user'));

  // The server assigns the conversation id. A missing id, an unknown id, and
  // an id this caller does not own never select someone else's row. The user
  // turn is stored before the model runs.
  const prepared = await prepareAssistantTurn({
    requestedId: body.conversationId,
    actor,
    locale,
    ip,
    userText: lastUserText,
  });
  if (prepared.kind === 'deny') return prepared.response;
  const conversationId = prepared.conversationId;

  // Resolve + verify the active filing (ownership) so tools can read/write it.
  let filingId: string | null = null;
  let entityType: EntityType = 'LLC';
  let stateCode: StateCode = ACTIVE_FORMATION_STATES.includes(
    (body.stateHint ?? '').toUpperCase() as StateCode,
  )
    ? ((body.stateHint as string).toUpperCase() as StateCode)
    : 'FL';
  let summary = null;

  if (body.filingId && actor) {
    const filing = await prisma.filing.findUnique({
      where: { id: body.filingId },
      include: {
        managersMembers: { orderBy: { position: 'asc' } },
        filingAdditionalServices: { include: { service: true } },
      },
    });
    if (filing && filing.userId === actor.id) {
      filingId = filing.id;
      entityType = (filing.entityType as EntityType) ?? 'LLC';
      stateCode = ACTIVE_FORMATION_STATES.includes(filing.state as StateCode)
        ? (filing.state as StateCode)
        : 'FL';
      summary = summarizeFiling(filing);
    }
  }

  const knowledge = buildKnowledge({ stateCode, entityType, locale });
  const system = buildSystemPrompt({
    knowledge,
    summary,
    locale,
    inWizard: !!body.filingId,
    isGuest: actor?.kind === 'guest',
  });

  const tools = buildAssistantTools({
    actor,
    filingId,
    entityType,
    stateCode,
    locale,
    onWrite: () => {},
  });

  try {
    const modelMessages = await convertToModelMessages(recent);
    const result = streamText({
      model: assistantModel,
      system,
      messages: modelMessages,
      tools,
      maxOutputTokens: assistantMaxOutputTokens(),
      stopWhen: stepCountIs(6),
      onFinish: async ({ text, finishReason, steps }) => {
        if (finishReason === 'length' || steps.some((step) => step.finishReason === 'length')) {
          logger.warn('assistant output length', { area: 'assistant', tag: 'length' });
        }
        const assistantText = text?.trim();
        if (!assistantText) return;
        try {
          await prisma.assistantConversation.update({
            where: { id: conversationId },
            data: { updatedAt: new Date(), filingId },
          });
          await prisma.assistantMessage.create({
            data: { conversationId, role: 'assistant', content: assistantText },
          });
        } catch (err) {
          logger.error('assistant transcript persist failed', { area: 'assistant', tag: 'persist' }, err);
        }
      },
    });
    return attachAssistantSession(result.toUIMessageStreamResponse(), conversationId);
  } catch (err) {
    logger.error('assistant stream failed', { area: 'assistant', tag: 'stream' }, err);
    return NextResponse.json({ error: 'The assistant had a problem. Please try again.' }, { status: 500 });
  }
}
