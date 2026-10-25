import { createUIMessageStream, createUIMessageStreamResponse } from 'ai';
import en from '@/messages/en.json';
import es from '@/messages/es.json';

/** Fixed reply when a conversation is over its turn cap or new-conversation cap. */
export function assistantLimitMessage(locale: string): string {
  return locale === 'es' ? es.assistant.conversationLimit : en.assistant.conversationLimit;
}

/**
 * UI message stream the chat widget already knows how to render.
 * HTTP 200 with the v1 stream header, same chunk shape as a normal text reply.
 * Does not call the model.
 */
export function assistantLimitResponse(locale: string): Response {
  const text = assistantLimitMessage(locale);
  const stream = createUIMessageStream({
    execute: ({ writer }) => {
      writer.write({ type: 'start' });
      writer.write({ type: 'start-step' });
      writer.write({ type: 'text-start', id: 'limit' });
      writer.write({ type: 'text-delta', id: 'limit', delta: text });
      writer.write({ type: 'text-end', id: 'limit' });
      writer.write({ type: 'finish-step' });
      writer.write({ type: 'finish', finishReason: 'stop' });
    },
  });
  return createUIMessageStreamResponse({ stream });
}
