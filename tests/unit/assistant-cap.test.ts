import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseJsonEventStream } from '@ai-sdk/provider-utils';
import { readUIMessageStream, uiMessageChunkSchema, type UIMessage } from 'ai';
import { pathForLocale } from '@/lib/locale-paths';
import en from '../../messages/en.json';
import es from '../../messages/es.json';

type Convo = {
  id: string;
  actorId: string | null;
  actorKind: string | null;
  filingId: string | null;
  locale: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type Msg = {
  id: string;
  conversationId: string;
  role: string;
  content: string;
  createdAt: Date;
};

const streamText = vi.hoisted(() => vi.fn());
const auth = vi.hoisted(() => vi.fn());
const getWizardActor = vi.hoisted(() => vi.fn());
const filingFindUnique = vi.hoisted(() => vi.fn());
const cookieJar = vi.hoisted(() => ({ value: undefined as string | undefined }));
const headerBox = vi.hoisted(() => ({ forwarded: '203.0.113.10', real: '', vercel: '' }));
const deliverEmailDirect = vi.hoisted(() =>
  vi.fn(async (_to: string, _subject: string, _html: string) => ({ ok: true })),
);
const db = vi.hoisted(() => ({
  convos: [] as Convo[],
  messages: [] as Msg[],
  updates: [] as string[],
  events: [] as string[],
  findUniqueError: false,
  raceExtraOnCreate: false,
  spend: new Map<string, bigint>(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/email', () => ({ deliverEmailDirect }));

vi.mock('next/headers', () => ({
  headers: () => {
    const h = new Headers();
    if (headerBox.vercel) h.set('x-vercel-forwarded-for', headerBox.vercel);
    if (headerBox.real) h.set('x-real-ip', headerBox.real);
    if (headerBox.forwarded) h.set('x-forwarded-for', headerBox.forwarded);
    return h;
  },
  cookies: () => ({
    get: (name: string) =>
      name === 'LF_CHAT' && cookieJar.value ? { name, value: cookieJar.value } : undefined,
  }),
}));

vi.mock('@/lib/auth', () => ({ auth }));
vi.mock('@/lib/guest', () => ({ getWizardActor }));

vi.mock('@/lib/db', () => {
  function convoMatches(
    row: Convo,
    where?: { id?: string; actorId?: string; createdAt?: { gte?: Date } },
  ) {
    if (!where) return true;
    if (where.id && row.id !== where.id) return false;
    if (where.actorId && row.actorId !== where.actorId) return false;
    if (where.createdAt?.gte && row.createdAt < where.createdAt.gte) return false;
    return true;
  }
  function messageMatches(
    row: Msg,
    where?: { conversationId?: string; role?: string; createdAt?: { gte?: Date } },
  ) {
    if (!where) return true;
    if (where.conversationId && row.conversationId !== where.conversationId) return false;
    if (where.role && row.role !== where.role) return false;
    if (where.createdAt?.gte && row.createdAt < where.createdAt.gte) return false;
    return true;
  }

  const api = {
    assistantConversation: {
      findUnique: async ({ where }: { where: { id: string } }) => {
        if (db.findUniqueError) throw new Error('db down');
        return db.convos.find((row) => row.id === where.id) ?? null;
      },
      count: async ({ where }: { where?: { actorId?: string; createdAt?: { gte?: Date } } }) =>
        db.convos.filter((row) => convoMatches(row, where)).length,
      create: async ({
        data,
      }: {
        data: {
          id: string;
          actorId?: string | null;
          actorKind?: string | null;
          filingId?: string | null;
          locale?: string | null;
        };
      }) => {
        const row: Convo = {
          id: data.id,
          actorId: data.actorId ?? null,
          actorKind: data.actorKind ?? null,
          filingId: data.filingId ?? null,
          locale: data.locale ?? null,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        db.convos.push(row);
        if (db.raceExtraOnCreate) {
          db.convos.push({
            id: `race_${db.convos.length}`,
            actorId: 'race_user',
            actorKind: 'user',
            filingId: null,
            locale: 'en',
            createdAt: new Date(),
            updatedAt: new Date(),
          });
        }
        return row;
      },
      update: async ({
        where,
        data,
      }: {
        where: { id: string };
        data: { filingId?: string | null; updatedAt?: Date };
      }) => {
        const row = db.convos.find((item) => item.id === where.id);
        if (!row) throw new Error(`missing conversation ${where.id}`);
        if (data.filingId !== undefined) row.filingId = data.filingId;
        if (data.updatedAt) row.updatedAt = data.updatedAt;
        db.updates.push(where.id);
        return row;
      },
      upsert: async () => {
        throw new Error('upsert should not run');
      },
    },
    assistantMessage: {
      count: async ({
        where,
      }: {
        where?: { conversationId?: string; role?: string; createdAt?: { gte?: Date } };
      }) => db.messages.filter((row) => messageMatches(row, where)).length,
      create: async ({
        data,
      }: {
        data: { conversationId: string; role: string; content: string };
      }) => {
        const row: Msg = {
          id: `msg_${db.messages.length + 1}`,
          conversationId: data.conversationId,
          role: data.role,
          content: data.content,
          createdAt: new Date(),
        };
        db.messages.push(row);
        if (data.role === 'user') db.events.push('insert');
        return row;
      },
      createMany: async () => {
        throw new Error('createMany should not run');
      },
    },
    assistantSpendDay: {
      findUnique: async ({ where }: { where: { day: Date } }) => {
        const key = where.day.toISOString().slice(0, 10);
        if (!db.spend.has(key)) return null;
        return { day: where.day, costMicroUsd: db.spend.get(key) };
      },
    },
    filing: { findUnique: filingFindUnique },
    $queryRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const sql = Array.from(strings).join(' ');
      if (sql.includes('FOR UPDATE')) {
        db.events.push('lock');
        return [];
      }
      if (sql.includes('AssistantSpendDay')) {
        const day = values[0] as Date;
        const delta = BigInt(values[1] as bigint);
        const key = day.toISOString().slice(0, 10);
        const next = (db.spend.get(key) ?? 0n) + delta;
        db.spend.set(key, next);
        return [{ costMicroUsd: next }];
      }
      return [];
    },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(api),
  };
  return { prisma: api };
});

vi.mock('ai', async () => {
  const actual = await vi.importActual<typeof import('ai')>('ai');
  return {
    ...actual,
    streamText: (...args: unknown[]) => streamText(...args),
  };
});

import { POST } from '@/app/api/assistant/route';
import { assistantRestMessage } from '@/lib/assistant/limit-reply';
import {
  DEFAULT_ASSISTANT_MAX_NEW_CONVERSATIONS_PER_HOUR,
  DEFAULT_ASSISTANT_MAX_OUTPUT_TOKENS,
} from '@/lib/assistant/limits';
import { assistantSpendDayDate } from '@/lib/assistant/spend-day';
import { INQUIRY_NOTIFY_EMAIL } from '@/lib/constants';
import {
  assistantChatSetCookie,
  readAssistantConversationId,
  signAssistantConversationId,
} from '@/lib/assistant/chat-cookie';
import { clientIp } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';

const TEST_KEY = 'unit-test-key';
const CHAT_SECRET = 'unit-test-chat-secret';
let ipSeq = 20;

function resetDb() {
  db.convos.length = 0;
  db.messages.length = 0;
  db.updates.length = 0;
  db.events.length = 0;
  db.findUniqueError = false;
  db.raceExtraOnCreate = false;
  db.spend.clear();
}

function nextIp() {
  ipSeq += 1;
  headerBox.forwarded = `203.0.113.${ipSeq}`;
  headerBox.real = '';
  headerBox.vercel = '';
}

function seedConversation(opts: {
  id: string;
  actorId?: string | null;
  actorKind?: string | null;
  filingId?: string | null;
  userTurns?: number;
  createdAt?: Date;
}) {
  const createdAt = opts.createdAt ?? new Date();
  db.convos.push({
    id: opts.id,
    actorId: opts.actorId === undefined ? 'user_1' : opts.actorId,
    actorKind: opts.actorKind === undefined ? 'user' : opts.actorKind,
    filingId: opts.filingId ?? null,
    locale: 'en',
    createdAt,
    updatedAt: createdAt,
  });
  for (let i = 0; i < (opts.userTurns ?? 0); i += 1) {
    db.messages.push({
      id: `${opts.id}_u${i}`,
      conversationId: opts.id,
      role: 'user',
      content: `turn ${i}`,
      createdAt,
    });
  }
}

function ask(extra: Record<string, unknown> = {}) {
  return POST(
    new Request('http://localhost/api/assistant', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        messages: [
          {
            id: 'u1',
            role: 'user',
            parts: [{ type: 'text', text: 'What is a registered agent?' }],
          },
        ],
        conversationId: 'conv_owned',
        locale: 'en',
        userTurnCount: 0,
        ...extra,
      }),
    }),
  );
}

function adoptCookie(res: Response) {
  const match = (res.headers.get('set-cookie') ?? '').match(/LF_CHAT=([^;]+)/);
  cookieJar.value = match?.[1];
}

async function visibleAssistantText(res: Response): Promise<string> {
  expect(res.status).toBe(200);
  expect(res.headers.get('content-type')).toContain('text/event-stream');
  expect(res.headers.get('x-vercel-ai-ui-message-stream')).toBe('v1');
  const raw = await res.text();
  const bytes = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(raw));
      controller.close();
    },
  });
  const parsed = parseJsonEventStream({ stream: bytes, schema: uiMessageChunkSchema });
  const chunks: unknown[] = [];
  const reader = parsed.getReader();
  while (true) {
    const next = await reader.read();
    if (next.done) break;
    expect(next.value.success, JSON.stringify(next.value)).toBe(true);
    if (next.value.success) chunks.push(next.value.value);
  }
  const replay = new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
  });
  let message: UIMessage | undefined;
  for await (const update of readUIMessageStream({ stream: replay })) {
    message = update;
  }
  return (message?.parts ?? [])
    .filter((part) => part.type === 'text')
    .map((part) => part.text)
    .join('');
}

beforeEach(() => {
  nextIp();
  resetDb();
  cookieJar.value = undefined;
  process.env.DEEPSEEK_API_KEY = TEST_KEY;
  process.env.NEXTAUTH_SECRET = CHAT_SECRET;
  delete process.env.ASSISTANT_MAX_OUTPUT_TOKENS;
  delete process.env.ASSISTANT_MAX_TURNS_PER_CONVERSATION;
  delete process.env.ASSISTANT_MAX_NEW_CONVERSATIONS_PER_IP;
  delete process.env.ASSISTANT_MAX_NEW_CONVERSATIONS_PER_HOUR;
  delete process.env.ASSISTANT_MAX_USER_MESSAGES_PER_MINUTE;
  delete process.env.ASSISTANT_DAILY_CAP_USD;
  deliverEmailDirect.mockClear();
  auth.mockReset();
  getWizardActor.mockReset();
  filingFindUnique.mockReset();
  streamText.mockReset();
  auth.mockResolvedValue({ user: { id: 'user_1', email: 'ada@example.com' } });
  getWizardActor.mockResolvedValue({ kind: 'user', id: 'user_1', email: 'ada@example.com' });
  filingFindUnique.mockResolvedValue(null);
  streamText.mockImplementation(() => ({
    toUIMessageStreamResponse: () => new Response('model-stream', { status: 200 }),
  }));
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('assistant spend caps', () => {
  it('returns the fixed English reply and does not call the model when the turn cap is reached', async () => {
    seedConversation({ id: 'conv_owned', userTurns: 20 });
    const res = await ask({ userTurnCount: 0 });
    const text = await visibleAssistantText(res);
    expect(text).toBe(en.assistant.conversationLimit);
    expect(text).toContain(pathForLocale('/contact', 'en'));
    expect(text).not.toContain(TEST_KEY);
    expect(streamText).not.toHaveBeenCalled();
    expect(res.headers.get('x-assistant-conversation-id')).toBe('conv_owned');
    expect(res.headers.get('set-cookie')?.toLowerCase()).toContain('httponly');
    expect(db.messages.filter((row) => row.conversationId === 'conv_owned')).toHaveLength(20);
    expect(db.events).toEqual(['lock']);
    expect(db.updates).toEqual([]);
  });

  it('returns the fixed Spanish reply with the Spanish contact path', async () => {
    seedConversation({ id: 'conv_owned', userTurns: 20 });
    const res = await ask({ locale: 'es' });
    const text = await visibleAssistantText(res);
    expect(text).toBe(es.assistant.conversationLimit);
    expect(text).toContain(pathForLocale('/contact', 'es'));
    expect(text).toContain('/es/contacto');
    expect(streamText).not.toHaveBeenCalled();
  });

  it('caps a guest-owned conversation the same way', async () => {
    getWizardActor.mockResolvedValue({ kind: 'guest', id: 'guest_1', email: null });
    seedConversation({ id: 'conv_guest', actorId: 'guest_1', actorKind: 'guest', userTurns: 20 });
    const res = await ask({ conversationId: 'conv_guest' });
    const text = await visibleAssistantText(res);
    expect(text).toBe(en.assistant.conversationLimit);
    expect(streamText).not.toHaveBeenCalled();
  });

  it('calls the model under the cap, passes maxOutputTokens, and stores the user turn first', async () => {
    seedConversation({ id: 'conv_owned', userTurns: 19 });
    const res = await ask();
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('model-stream');
    expect(DEFAULT_ASSISTANT_MAX_OUTPUT_TOKENS).toBe(6144);
    expect(streamText).toHaveBeenCalledTimes(1);
    expect(streamText.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        maxOutputTokens: 6144,
        stopWhen: expect.any(Function),
      }),
    );
    expect(db.events).toEqual(['lock', 'insert']);
    expect(db.messages.filter((row) => row.role === 'user')).toHaveLength(20);
    expect(res.headers.get('x-assistant-conversation-id')).toBe('conv_owned');
  });

  it('uses ASSISTANT_MAX_OUTPUT_TOKENS when it is set', async () => {
    process.env.ASSISTANT_MAX_OUTPUT_TOKENS = '2222';
    seedConversation({ id: 'conv_owned', userTurns: 1 });
    await ask();
    expect(streamText.mock.calls[0]?.[0].maxOutputTokens).toBe(2222);
  });

  it('assigns a server conversation id when the client omits one', async () => {
    const res = await ask({ conversationId: '   ' });
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('model-stream');
    const id = res.headers.get('x-assistant-conversation-id');
    expect(id).toBeTruthy();
    expect(db.convos.map((row) => row.id)).toEqual([id]);
    expect(readAssistantConversationId(adoptedValue(res))).toBe(id);
    expect(streamText).toHaveBeenCalledTimes(1);
    expect(db.messages.filter((row) => row.role === 'user')).toHaveLength(1);
  });

  it('ignores a client-minted id that is not already stored', async () => {
    const res = await ask({ conversationId: 'client-minted-id' });
    const id = res.headers.get('x-assistant-conversation-id');
    expect(id).toBeTruthy();
    expect(id).not.toBe('client-minted-id');
    expect(db.convos.some((row) => row.id === 'client-minted-id')).toBe(false);
    expect(streamText).toHaveBeenCalledTimes(1);
  });

  it('applies the turn cap to an anonymous visitor who holds the chat cookie', async () => {
    auth.mockResolvedValue(null);
    getWizardActor.mockResolvedValue(null);
    seedConversation({ id: 'conv_anon', actorId: null, actorKind: null, userTurns: 20 });
    cookieJar.value = signAssistantConversationId('conv_anon');
    const res = await ask({ conversationId: '   ' });
    const text = await visibleAssistantText(res);
    expect(text).toBe(en.assistant.conversationLimit);
    expect(streamText).not.toHaveBeenCalled();
    expect(db.convos).toHaveLength(1);
    expect(db.messages).toHaveLength(20);
    expect(res.headers.get('x-assistant-conversation-id')).toBe('conv_anon');
  });

  it('does not call the model for a foreign conversation or write into it', async () => {
    seedConversation({
      id: 'conv_victim',
      actorId: 'someone_else',
      actorKind: 'user',
      filingId: 'filing_old',
      userTurns: 1,
    });
    filingFindUnique.mockResolvedValue({
      id: 'filing_attacker',
      userId: 'user_1',
      entityType: 'LLC',
      state: 'FL',
      serviceTier: 'basic',
      taxElection: null,
      currentStep: 1,
      status: 'draft',
      businessName: 'Acme',
      principalAddress: null,
      registeredAgent: null,
      incorporatorSignature: null,
      managersMembers: [],
      filingAdditionalServices: [],
    });
    let finished = Promise.resolve();
    streamText.mockImplementation((opts: { onFinish?: (event: unknown) => Promise<void> }) => {
      finished = Promise.resolve(
        opts.onFinish?.({
          text: 'not your chat',
          finishReason: 'stop',
          steps: [{ finishReason: 'stop' }],
        }),
      ).then(() => undefined);
      return { toUIMessageStreamResponse: () => new Response('model-stream', { status: 200 }) };
    });

    const res = await ask({ conversationId: 'conv_victim', filingId: 'filing_attacker' });
    await finished;
    const id = res.headers.get('x-assistant-conversation-id');
    expect(id).toBeTruthy();
    expect(id).not.toBe('conv_victim');
    expect(streamText).toHaveBeenCalledTimes(1);
    const victim = db.convos.find((row) => row.id === 'conv_victim');
    expect(victim?.filingId).toBe('filing_old');
    expect(db.messages.filter((row) => row.conversationId === 'conv_victim')).toHaveLength(1);
    expect(db.updates).toEqual([id]);
    const fresh = db.messages.filter((row) => row.conversationId === id);
    expect(fresh.map((row) => row.role).sort()).toEqual(['assistant', 'user']);
    expect(db.convos.find((row) => row.id === id)?.filingId).toBe('filing_attacker');
  });

  it('blocks a second new conversation once the in-memory cap is exhausted', async () => {
    process.env.ASSISTANT_MAX_NEW_CONVERSATIONS_PER_IP = '1';
    const info = vi.spyOn(logger, 'info').mockImplementation(() => {});
    const first = await ask({ conversationId: '' });
    expect(await first.text()).toBe('model-stream');
    expect(streamText).toHaveBeenCalledTimes(1);

    streamText.mockClear();
    const second = await ask({ conversationId: '' });
    const text = await visibleAssistantText(second);
    expect(text).toBe(en.assistant.conversationLimit);
    expect(streamText).not.toHaveBeenCalled();
    expect(db.convos).toHaveLength(1);
    expect(second.headers.get('x-assistant-conversation-id')).toBeNull();
    expectNewConversationCap(info, 'ip');
  });

  it('continues the same server conversation on retry without opening another one', async () => {
    process.env.ASSISTANT_MAX_NEW_CONVERSATIONS_PER_IP = '1';
    const first = await ask({ conversationId: '' });
    expect(await first.text()).toBe('model-stream');
    const id = first.headers.get('x-assistant-conversation-id');
    adoptCookie(first);
    const retry = await ask({ conversationId: id });
    expect(retry.status).toBe(200);
    expect(await retry.text()).toBe('model-stream');
    expect(streamText).toHaveBeenCalledTimes(2);
    expect(db.convos).toHaveLength(1);
    expect(db.messages.filter((row) => row.role === 'user')).toHaveLength(2);
  });

  it('blocks a new conversation from the database hour count even when this instance still has IP room', async () => {
    process.env.ASSISTANT_MAX_NEW_CONVERSATIONS_PER_IP = '50';
    process.env.ASSISTANT_MAX_NEW_CONVERSATIONS_PER_HOUR = '1';
    expect(DEFAULT_ASSISTANT_MAX_NEW_CONVERSATIONS_PER_HOUR).toBe(40);
    seedConversation({ id: 'conv_recent', actorId: 'someone_else', userTurns: 0 });
    const info = vi.spyOn(logger, 'info').mockImplementation(() => {});
    const res = await ask({ conversationId: '' });
    const text = await visibleAssistantText(res);
    expect(text).toBe(en.assistant.conversationLimit);
    expect(streamText).not.toHaveBeenCalled();
    expect(db.convos.map((row) => row.id)).toEqual(['conv_recent']);
    expect(res.headers.get('set-cookie')).toBeNull();
    expectNewConversationCap(info, 'global');
  });

  it('does not hand back a conversation id when the hour count is crossed while creating it', async () => {
    process.env.ASSISTANT_MAX_NEW_CONVERSATIONS_PER_HOUR = '1';
    db.raceExtraOnCreate = true;
    const info = vi.spyOn(logger, 'info').mockImplementation(() => {});
    const res = await ask({ conversationId: '' });
    const text = await visibleAssistantText(res);
    expect(text).toBe(en.assistant.conversationLimit);
    expect(streamText).not.toHaveBeenCalled();
    expect(res.headers.get('x-assistant-conversation-id')).toBeNull();
    expect(res.headers.get('set-cookie')).toBeNull();
    expect(db.convos.length).toBeGreaterThan(1);
    expect(db.messages).toHaveLength(0);
    expectNewConversationCap(info, 'global');
  });

  it('blocks a logged-in user when their own recent conversations already hit the cap', async () => {
    process.env.ASSISTANT_MAX_NEW_CONVERSATIONS_PER_IP = '1';
    seedConversation({ id: 'conv_mine', userTurns: 0 });
    const info = vi.spyOn(logger, 'info').mockImplementation(() => {});
    const res = await ask({ conversationId: '' });
    const text = await visibleAssistantText(res);
    expect(text).toBe(en.assistant.conversationLimit);
    expect(streamText).not.toHaveBeenCalled();
    expect(db.convos.map((row) => row.id)).toEqual(['conv_mine']);
    expectNewConversationCap(info, 'actor');
  });

  it('keeps the user turn when the model throws, and does not call it again', async () => {
    streamText.mockImplementation(() => {
      throw new Error('provider down');
    });
    const res = await ask({ conversationId: '' });
    expect(res.status).toBe(500);
    expect(streamText).toHaveBeenCalledTimes(1);
    expect(db.messages.map((row) => row.role)).toEqual(['user']);
    expect(db.events).toEqual(['lock', 'insert']);
  });

  it('logs when the model stops because the output cap was reached', async () => {
    seedConversation({ id: 'conv_owned', userTurns: 1 });
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    let finished = Promise.resolve();
    streamText.mockImplementation((opts: { onFinish?: (event: unknown) => Promise<void> }) => {
      finished = Promise.resolve(
        opts.onFinish?.({
          text: 'partial',
          finishReason: 'length',
          steps: [{ finishReason: 'length' }],
        }),
      ).then(() => undefined);
      return { toUIMessageStreamResponse: () => new Response('model-stream', { status: 200 }) };
    });
    await ask();
    await finished;
    expect(warn).toHaveBeenCalledWith(
      'assistant output length',
      expect.objectContaining({ area: 'assistant', tag: 'length' }),
    );
    const rows = db.messages.filter((row) => row.conversationId === 'conv_owned');
    expect(rows.filter((row) => row.role === 'user')).toHaveLength(2);
    expect(rows.filter((row) => row.role === 'assistant').map((row) => row.content)).toEqual(['partial']);
    expect(JSON.stringify(warn.mock.calls)).not.toContain('partial');
  });

  it('returns 429 from the database message count without calling the model', async () => {
    process.env.ASSISTANT_MAX_USER_MESSAGES_PER_MINUTE = '2';
    seedConversation({ id: 'conv_busy', userTurns: 2 });
    const res = await ask({ conversationId: '' });
    expect(res.status).toBe(429);
    expect(streamText).not.toHaveBeenCalled();
    expect(db.convos.map((row) => row.id)).toEqual(['conv_busy']);
    expect(db.messages).toHaveLength(2);
  });

  it('returns 500 and skips the model when the conversation lookup fails', async () => {
    db.findUniqueError = true;
    const res = await ask();
    expect(res.status).toBe(500);
    expect(streamText).not.toHaveBeenCalled();
    expect(db.messages).toHaveLength(0);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('The assistant had a problem. Please try again.');
    expect(body.error).not.toContain(TEST_KEY);
  });

  it('returns the limit reply for a capped conversation when the cookie is gone', async () => {
    auth.mockResolvedValue(null);
    getWizardActor.mockResolvedValue(null);
    seedConversation({
      id: 'conv_anon',
      actorId: null,
      actorKind: null,
      filingId: 'filing_keep',
      userTurns: 20,
    });
    const res = await ask({ conversationId: 'conv_anon', locale: 'es' });
    const text = await visibleAssistantText(res);
    expect(text).toBe(es.assistant.conversationLimit);
    expect(streamText).not.toHaveBeenCalled();
    expect(db.convos).toHaveLength(1);
    expect(db.messages).toHaveLength(20);
    expect(res.headers.get('set-cookie')).toBeNull();
    expect(res.headers.get('x-assistant-conversation-id')).toBeNull();
    expect(db.convos[0]?.filingId).toBe('filing_keep');
  });

  it('opens a fresh conversation when an unowned chat is still under the turn cap', async () => {
    auth.mockResolvedValue(null);
    getWizardActor.mockResolvedValue(null);
    seedConversation({
      id: 'conv_anon',
      actorId: null,
      actorKind: null,
      filingId: 'filing_keep',
      userTurns: 1,
    });
    const res = await ask({ conversationId: 'conv_anon' });
    expect(await res.text()).toBe('model-stream');
    expect(streamText).toHaveBeenCalledTimes(1);
    const id = res.headers.get('x-assistant-conversation-id');
    expect(id).toBeTruthy();
    expect(id).not.toBe('conv_anon');
    expect(db.messages.filter((row) => row.conversationId === 'conv_anon')).toHaveLength(1);
    expect(db.convos.find((row) => row.id === 'conv_anon')?.filingId).toBe('filing_keep');
    const cookie = res.headers.get('set-cookie') ?? '';
    expect(cookie).toContain(id ?? 'missing');
    expect(cookie).not.toContain('conv_anon');
  });

  it('passes the request abort signal so a cancelled chat stops model spend', async () => {
    seedConversation({ id: 'conv_owned', userTurns: 1 });
    const request = new Request('http://localhost/api/assistant', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        messages: [
          {
            id: 'u1',
            role: 'user',
            parts: [{ type: 'text', text: 'What is a registered agent?' }],
          },
        ],
        conversationId: 'conv_owned',
        locale: 'en',
      }),
    });
    await POST(request);
    expect(streamText).toHaveBeenCalledTimes(1);
    const opts = streamText.mock.calls[0]?.[0] as { abortSignal?: AbortSignal };
    expect(opts.abortSignal).toBe(request.signal);
  });

  it('strips em dashes and en dashes from the stream and the stored reply', async () => {
    seedConversation({ id: 'conv_owned', userTurns: 1 });
    let finished = Promise.resolve();
    streamText.mockImplementation(
      (opts: {
        experimental_transform?: () => TransformStream<Record<string, unknown>>;
        onFinish?: (event: unknown) => Promise<void>;
      }) => {
        const transform = opts.experimental_transform?.();
        finished = (async () => {
          if (!transform) throw new Error('missing dash transform');
          const writer = transform.writable.getWriter();
          const reader = transform.readable.getReader();
          const read = reader.read();
          await writer.write({ type: 'text-delta', id: 'd1', text: 'Hello\u2014there\u2013now' });
          const chunk = await read;
          expect(chunk.done).toBe(false);
          expect(chunk.value).toMatchObject({ type: 'text-delta', text: 'Hello,there-now' });
          await writer.close();
          await opts.onFinish?.({
            text: 'Hello\u2014there',
            finishReason: 'stop',
            steps: [{ finishReason: 'stop' }],
            totalUsage: { inputTokens: 0, outputTokens: 0 },
          });
        })();
        return { toUIMessageStreamResponse: () => new Response('model-stream', { status: 200 }) };
      },
    );
    await ask();
    await finished;
    expect(db.messages.filter((row) => row.role === 'assistant').map((row) => row.content)).toEqual([
      'Hello,there',
    ]);
  });

  it('rests for the day before calling the model when the spend cap is already reached', async () => {
    process.env.ASSISTANT_DAILY_CAP_USD = '1';
    db.spend.set(assistantSpendDayDate().toISOString().slice(0, 10), 1_000_000n);
    const res = await ask({ conversationId: '', locale: 'es' });
    const text = await visibleAssistantText(res);
    expect(text).toBe(assistantRestMessage('es'));
    expect(streamText).not.toHaveBeenCalled();
    expect(db.convos).toHaveLength(0);
    expect(db.messages).toHaveLength(0);
  });

  it('rests when the daily cap is zero even with no spend row', async () => {
    process.env.ASSISTANT_DAILY_CAP_USD = '0';
    const res = await ask({ conversationId: '' });
    const text = await visibleAssistantText(res);
    expect(text).toBe(assistantRestMessage('en'));
    expect(streamText).not.toHaveBeenCalled();
    expect(db.convos).toHaveLength(0);
  });

  it('calls the model when the daily cap is unset', async () => {
    db.spend.set(assistantSpendDayDate().toISOString().slice(0, 10), 50_000_000n);
    seedConversation({ id: 'conv_owned', userTurns: 1 });
    const res = await ask();
    expect(await res.text()).toBe('model-stream');
    expect(streamText).toHaveBeenCalledTimes(1);
  });

  it('calls the model when the daily cap env is not a USD amount', async () => {
    process.env.ASSISTANT_DAILY_CAP_USD = 'nope';
    seedConversation({ id: 'conv_owned', userTurns: 1 });
    const res = await ask();
    expect(await res.text()).toBe('model-stream');
    expect(streamText).toHaveBeenCalledTimes(1);
  });

  it('adds the turn cost and emails once when the daily cap is crossed', async () => {
    process.env.ASSISTANT_DAILY_CAP_USD = '1';
    seedConversation({ id: 'conv_owned', userTurns: 1 });
    let finished = Promise.resolve();
    streamText.mockImplementation((opts: { onFinish?: (event: unknown) => Promise<void> }) => {
      finished = Promise.resolve(
        opts.onFinish?.({
          text: 'priced',
          finishReason: 'stop',
          steps: [{ finishReason: 'stop' }],
          totalUsage: {
            inputTokens: 0,
            outputTokens: 1_000_000,
            inputTokenDetails: { noCacheTokens: 0, cacheReadTokens: 0 },
          },
        }),
      ).then(() => undefined);
      return { toUIMessageStreamResponse: () => new Response('model-stream', { status: 200 }) };
    });
    await ask();
    await finished;
    expect(db.spend.size).toBe(1);
    const total = [...db.spend.values()][0];
    expect([1_980_000n, 3_960_000n]).toContain(total);
    expect(deliverEmailDirect).toHaveBeenCalledTimes(1);
    const [to, subject, html] = deliverEmailDirect.mock.calls[0] as unknown as [string, string, string];
    expect(to).toBe(INQUIRY_NOTIFY_EMAIL);
    expect(`${subject} ${html}`).not.toMatch(/[\u2014\u2013]/);
  });
});

describe('assistant client ip', () => {
  it('prefers x-vercel-forwarded-for, then x-real-ip, then x-forwarded-for', () => {
    headerBox.vercel = '198.51.100.9, 10.0.0.1';
    headerBox.real = '198.51.100.8';
    headerBox.forwarded = '198.51.100.7, 10.0.0.2';
    expect(clientIp()).toBe('198.51.100.9');
    headerBox.vercel = '';
    expect(clientIp()).toBe('198.51.100.8');
    headerBox.real = '';
    expect(clientIp()).toBe('198.51.100.7');
  });
});

describe('assistant chat cookie', () => {
  it('round trips a signed id and marks the cookie Secure only in production', () => {
    const token = signAssistantConversationId('conv_owned');
    expect(readAssistantConversationId(token)).toBe('conv_owned');
    expect(readAssistantConversationId(`${token}x`)).toBeNull();
    expect(readAssistantConversationId('v1.conv_owned.not-the-signature')).toBeNull();
    const previous = process.env.NODE_ENV;
    const env = process.env as Record<string, string | undefined>;
    env.NODE_ENV = 'production';
    try {
      expect(assistantChatSetCookie('conv_owned')).toContain('Secure');
    } finally {
      env.NODE_ENV = previous;
    }
    expect(assistantChatSetCookie('conv_owned').includes('Secure')).toBe(false);
  });
});

describe('assistant limit copy', () => {
  it('matches the approved sentences and points at the contact paths', () => {
    const visible = (value: string) => value.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
    expect(visible(en.assistant.conversationLimit)).toBe(
      'We have reached the chat limit for this conversation. You can keep going in the form, or contact us and a person will help you.',
    );
    expect(visible(es.assistant.conversationLimit)).toBe(
      'Llegamos al límite de este chat. Puedes seguir en el formulario o escribirnos y una persona te ayudará.',
    );
    expect(en.assistant.conversationLimit).toContain('](/contact)');
    expect(es.assistant.conversationLimit).toContain('](/es/contacto)');
    expect(en.assistant.conversationLimit).not.toContain('—');
    expect(es.assistant.conversationLimit).not.toContain('—');
    expect(assistantRestMessage('en')).toBe(
      "Our assistant is resting for today. Email admin@launchforma.com and we'll help you.",
    );
    expect(assistantRestMessage('es')).toBe(
      'Nuestro asistente descansa por hoy. Escríbenos a admin@launchforma.com y te ayudamos.',
    );
    expect(assistantRestMessage('en')).not.toMatch(/[\u2014\u2013]/);
    expect(assistantRestMessage('es')).not.toMatch(/[\u2014\u2013]/);
    expect(JSON.stringify(en.assistant)).not.toContain('@launchforma.com');
    expect(JSON.stringify(es.assistant)).not.toContain('@launchforma.com');
    const prompt = readFileSync('lib/assistant/system-prompt.ts', 'utf8');
    expect(prompt).toContain('Never use an em dash');
    expect(prompt).not.toMatch(/[\u2014\u2013]/);
    const widget = readFileSync('components/assistant/ChatWidget.tsx', 'utf8');
    expect(widget).toContain("url.startsWith('/')");
    expect(widget).toContain('<ReactMarkdown');
    expect(widget).toContain('x-assistant-conversation-id');
    expect(widget).not.toContain('randomUUID');
    expect(widget).toContain("onWizard && 'max-md:hidden'");
    const guard = readFileSync('lib/assistant/conversation-cap.ts', 'utf8');
    expect(guard).toContain('FOR UPDATE');
    expect(guard).toContain("logger.info('new conversation cap'");
  });
});

function adoptedValue(res: Response): string | undefined {
  return (res.headers.get('set-cookie') ?? '').match(/LF_CHAT=([^;]+)/)?.[1];
}

function expectNewConversationCap(
  info: { mock: { calls: unknown[][] } },
  layer: 'ip' | 'global' | 'actor',
) {
  const call = info.mock.calls.find(
    (entry) =>
      entry[0] === 'new conversation cap' &&
      (entry[1] as { layer?: string } | undefined)?.layer === layer,
  );
  expect(call).toBeTruthy();
  const ctx = call?.[1] as { ipHash: string };
  expect(ctx.ipHash).toMatch(/^[0-9a-f]{8}$/);
  expect(JSON.stringify(ctx)).not.toContain(headerBox.forwarded);
}
