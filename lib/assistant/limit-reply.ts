import { createUIMessageStream, createUIMessageStreamResponse } from 'ai';
import en from '@/messages/en.json';
import es from '@/messages/es.json';

/**
 * Resting copy stays in this server module. The contact page ships the
 * assistant catalog to the browser, and that HTML must not contain an email
 * address. The chat still receives this sentence in the stream when the
 * daily cap is already reached.
 */
const DAILY_REST = {
  en: "Our assistant is resting for today. Email admin@launchforma.com and we'll help you.",
  es: 'Nuestro asistente descansa por hoy. Escríbenos a admin@launchforma.com y te ayudamos.',
} as const;

/** Fixed reply when a conversation is over its turn cap or new-conversation cap. */
export function assistantLimitMessage(locale: string): string {
  return locale === 'es' ? es.assistant.conversationLimit : en.assistant.conversationLimit;
}

/** Fixed reply when the daily spend cap is already reached. */
export function assistantRestMessage(locale: string): string {
  return locale === 'es' ? DAILY_REST.es : DAILY_REST.en;
}

/**
 * UI message stream the chat widget already knows how to render.
 * HTTP 200 with the v1 stream header, same chunk shape as a normal text reply.
 * Does not call the model.
 */
function fixedTextResponse(text: string, id: string): Response {
  const stream = createUIMessageStream({
    execute: ({ writer }) => {
      writer.write({ type: 'start' });
      writer.write({ type: 'start-step' });
      writer.write({ type: 'text-start', id });
      writer.write({ type: 'text-delta', id, delta: text });
      writer.write({ type: 'text-end', id });
      writer.write({ type: 'finish-step' });
      writer.write({ type: 'finish', finishReason: 'stop' });
    },
  });
  return createUIMessageStreamResponse({ stream });
}

export function assistantLimitResponse(locale: string): Response {
  return fixedTextResponse(assistantLimitMessage(locale), 'limit');
}

export function assistantRestResponse(locale: string): Response {
  return fixedTextResponse(assistantRestMessage(locale), 'rest');
}
