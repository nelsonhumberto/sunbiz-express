import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { parseJsonEventStream } from '@ai-sdk/provider-utils';
import { readUIMessageStream, uiMessageChunkSchema, type UIMessage } from 'ai';
import { pathForLocale } from '@/lib/locale-paths';
import en from '../../messages/en.json';
import es from '../../messages/es.json';

const streamText = vi.hoisted(() => vi.fn());
const auth = vi.hoisted(() => vi.fn());
const getWizardActor = vi.hoisted(() => vi.fn());
const conversationFindUnique = vi.hoisted(() => vi.fn());
const ipBox = vi.hoisted(() => ({ value: '203.0.113.10' }));

vi.mock('server-only', () => ({}));

vi.mock('next/headers', () => ({
  headers: () => new Headers({ 'x-forwarded-for': ipBox.value }),
  cookies: () => ({ get: () => undefined }),
}));

vi.mock('@/lib/auth', () => ({ auth }));
vi.mock('@/lib/guest', () => ({ getWizardActor }));
vi.mock('@/lib/db', () => ({
  prisma: {
    assistantConversation: { findUnique: conversationFindUnique, upsert: vi.fn() },
    assistantMessage: { createMany: vi.fn(), count: vi.fn() },
    filing: { findUnique: vi.fn() },
  },
}));

vi.mock('ai', async () => {
  const actual = await vi.importActual<typeof import('ai')>('ai');
  return {
    ...actual,
    streamText: (...args: unknown[]) => streamText(...args),
  };
});

import { POST } from '@/app/api/assistant/route';
import { DEFAULT_ASSISTANT_MAX_OUTPUT_TOKENS } from '@/lib/assistant/limits';

const TEST_KEY = 'unit-test-key';
let ipSeq = 20;

function nextIp() {
  ipSeq += 1;
  ipBox.value = `203.0.113.${ipSeq}`;
}

function ownedConversation(userTurns: number, actorId = 'user_1', actorKind = 'user') {
  conversationFindUnique.mockResolvedValue({
    actorId,
    actorKind,
    _count: { messages: userTurns },
  });
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
  process.env.DEEPSEEK_API_KEY = TEST_KEY;
  delete process.env.ASSISTANT_MAX_OUTPUT_TOKENS;
  delete process.env.ASSISTANT_MAX_TURNS_PER_CONVERSATION;
  delete process.env.ASSISTANT_MAX_NEW_CONVERSATIONS_PER_IP;
  auth.mockReset();
  getWizardActor.mockReset();
  conversationFindUnique.mockReset();
  streamText.mockReset();
  auth.mockResolvedValue({ user: { id: 'user_1', email: 'ada@example.com' } });
  getWizardActor.mockResolvedValue({ kind: 'user', id: 'user_1', email: 'ada@example.com' });
  streamText.mockImplementation(() => ({
    toUIMessageStreamResponse: () => new Response('model-stream', { status: 200 }),
  }));
});

describe('assistant spend caps', () => {
  it('returns the fixed English reply and does not call the model when the turn cap is reached', async () => {
    ownedConversation(20);
    const res = await ask({ userTurnCount: 0 });
    const text = await visibleAssistantText(res);
    expect(text).toBe(en.assistant.conversationLimit);
    expect(text).toContain(pathForLocale('/contact', 'en'));
    expect(text).not.toContain(TEST_KEY);
    expect(streamText).not.toHaveBeenCalled();
    expect(conversationFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'conv_owned' },
        select: expect.objectContaining({
          _count: { select: { messages: { where: { role: 'user' } } } },
        }),
      }),
    );
  });

  it('returns the fixed Spanish reply with the Spanish contact path', async () => {
    ownedConversation(20);
    const res = await ask({ locale: 'es' });
    const text = await visibleAssistantText(res);
    expect(text).toBe(es.assistant.conversationLimit);
    expect(text).toContain(pathForLocale('/contact', 'es'));
    expect(text).toContain('/es/contacto');
    expect(streamText).not.toHaveBeenCalled();
  });

  it('calls the model under the cap and passes maxOutputTokens', async () => {
    ownedConversation(19);
    const res = await ask();
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('model-stream');
    expect(streamText).toHaveBeenCalledTimes(1);
    expect(streamText.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        maxOutputTokens: DEFAULT_ASSISTANT_MAX_OUTPUT_TOKENS,
        stopWhen: expect.any(Function),
      }),
    );
  });

  it('uses ASSISTANT_MAX_OUTPUT_TOKENS when it is set', async () => {
    process.env.ASSISTANT_MAX_OUTPUT_TOKENS = '2222';
    ownedConversation(1);
    await ask();
    expect(streamText.mock.calls[0]?.[0].maxOutputTokens).toBe(2222);
  });

  it('keeps going when the conversation id is missing or not owned by the actor', async () => {
    const missing = await ask({ conversationId: '   ' });
    expect(missing.status).toBe(200);
    expect(await missing.text()).toBe('model-stream');
    expect(conversationFindUnique).not.toHaveBeenCalled();

    conversationFindUnique.mockClear();
    streamText.mockClear();
    ownedConversation(100, 'someone_else', 'user');
    const foreign = await ask({ conversationId: 'conv_foreign' });
    expect(foreign.status).toBe(200);
    expect(await foreign.text()).toBe('model-stream');
    expect(streamText).toHaveBeenCalledTimes(1);
  });

  it('blocks a new conversation id once the per-IP creation cap is exhausted', async () => {
    process.env.ASSISTANT_MAX_NEW_CONVERSATIONS_PER_IP = '1';
    conversationFindUnique.mockResolvedValue(null);
    const first = await ask({ conversationId: 'conv_new_a' });
    expect(first.status).toBe(200);
    expect(await first.text()).toBe('model-stream');
    expect(streamText).toHaveBeenCalledTimes(1);

    streamText.mockClear();
    const second = await ask({ conversationId: 'conv_new_b' });
    const text = await visibleAssistantText(second);
    expect(text).toBe(en.assistant.conversationLimit);
    expect(streamText).not.toHaveBeenCalled();
  });

  it('lets a retry of the same new conversation id through without burning another slot', async () => {
    process.env.ASSISTANT_MAX_NEW_CONVERSATIONS_PER_IP = '1';
    conversationFindUnique.mockResolvedValue(null);
    const first = await ask({ conversationId: 'conv_retry' });
    expect(await first.text()).toBe('model-stream');
    const retry = await ask({ conversationId: 'conv_retry' });
    expect(retry.status).toBe(200);
    expect(await retry.text()).toBe('model-stream');
    expect(streamText).toHaveBeenCalledTimes(2);
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
    const widget = readFileSync('components/assistant/ChatWidget.tsx', 'utf8');
    expect(widget).toContain("url.startsWith('/')");
    expect(widget).toContain('<ReactMarkdown');
  });
});
