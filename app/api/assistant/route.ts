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

  // Per-IP throttle — keeps cost + abuse bounded.
  const limit = rateLimit(`assistant:${clientIp()}`, 30, 60 * 1000);
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

  const locale = body.locale === 'es' ? 'es' : 'en';
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

  // Keep cost bounded: only the most recent turns.
  const recent = body.messages.slice(-20);
  const lastUserText = messageText([...recent].reverse().find((m) => m.role === 'user'));
  const modelMessages = await convertToModelMessages(recent);

  try {
    const result = streamText({
      model: assistantModel,
      system,
      messages: modelMessages,
      tools,
      stopWhen: stepCountIs(6),
      onFinish: async ({ text }) => {
        // Best-effort transcript persistence for handoff context + KB tuning.
        if (!body.conversationId) return;
        try {
          await prisma.assistantConversation.upsert({
            where: { id: body.conversationId },
            create: {
              id: body.conversationId,
              actorId: actor?.id ?? null,
              actorKind: actor?.kind ?? null,
              filingId,
              locale,
            },
            update: { updatedAt: new Date(), filingId },
          });
          const rows = [
            ...(lastUserText ? [{ role: 'user', content: lastUserText }] : []),
            ...(text?.trim() ? [{ role: 'assistant', content: text.trim() }] : []),
          ];
          if (rows.length) {
            await prisma.assistantMessage.createMany({
              data: rows.map((r) => ({ conversationId: body.conversationId!, ...r })),
            });
          }
        } catch (err) {
          logger.error('assistant transcript persist failed', { area: 'assistant', tag: 'persist' }, err);
        }
      },
    });
    return result.toUIMessageStreamResponse();
  } catch (err) {
    logger.error('assistant stream failed', { area: 'assistant', tag: 'stream' }, err);
    return NextResponse.json({ error: 'The assistant had a problem. Please try again.' }, { status: 500 });
  }
}
