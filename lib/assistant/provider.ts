import 'server-only';

import { createDeepSeek } from '@ai-sdk/deepseek';

/**
 * Official DeepSeek provider. We use it (rather than the generic OpenAI-
 * compatible provider) specifically because deepseek-v4-pro runs in THINKING
 * mode by default, and DeepSeek's tool-calls contract requires the
 * `reasoning_content` to be replayed on every turn that performed a tool call
 * (otherwise the API returns 400). This provider maps + replays that field for
 * us, which our tool-heavy assistant depends on.
 *
 * Privacy note: only redacted context + the user's questions reach DeepSeek.
 * SSN/Tax-IDs are never sent (see lib/assistant/redact.ts).
 */
const deepseek = createDeepSeek({
  apiKey: process.env.DEEPSEEK_API_KEY ?? '',
  ...(process.env.DEEPSEEK_BASE_URL ? { baseURL: process.env.DEEPSEEK_BASE_URL } : {}),
});

export const ASSISTANT_MODEL_ID = process.env.ASSISTANT_MODEL ?? 'deepseek-v4-pro';

export const assistantModel = deepseek(ASSISTANT_MODEL_ID);

/** True when the assistant has an API key configured. */
export function assistantConfigured(): boolean {
  return Boolean(process.env.DEEPSEEK_API_KEY?.trim());
}
