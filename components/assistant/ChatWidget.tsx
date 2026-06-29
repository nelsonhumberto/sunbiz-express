'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { MessageCircle, X, Send, Sparkles, ArrowRight, Loader2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '@/lib/utils';
import { trackEvent } from '@/lib/analytics';

/** Pull the filing id out of a /wizard/{id}/{step} path, if present. */
function filingIdFromPath(path: string | null): string | undefined {
  if (!path) return undefined;
  const m = path.match(/^\/wizard\/([^/]+)\//);
  return m?.[1];
}

interface ToolOutput {
  ok?: boolean;
  updated?: string;
  value?: string;
  url?: string;
  navigateTo?: string;
  reason?: string;
  message?: string;
  error?: string;
}

export function ChatWidget() {
  const t = useTranslations('assistant');
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const handledWrites = useRef<Set<string>>(new Set());
  const conversationId = useRef<string>(
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2),
  );

  const filingId = filingIdFromPath(pathname);

  const transport = useMemo(
    () => new DefaultChatTransport({ api: '/api/assistant' }),
    [],
  );
  const { messages, sendMessage, status } = useChat({ transport });

  const busy = status === 'submitted' || status === 'streaming';

  const send = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    setInput('');
    trackEvent('assistant_message_sent', { inWizard: !!filingId });
    void sendMessage(
      { text: trimmed },
      { body: { filingId, locale, conversationId: conversationId.current } },
    );
  };

  // Auto-scroll to the latest message.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, open]);

  // React to tool results that change the page: a write refreshes the current
  // step so filled fields appear; a navigation advances the user to the next
  // step. Navigation wins (it loads a fresh step anyway).
  useEffect(() => {
    let shouldRefresh = false;
    let navigateTo: string | null = null;
    for (const m of messages) {
      for (const part of (m.parts ?? []) as Array<Record<string, unknown>>) {
        const type = part.type as string | undefined;
        if (!type?.startsWith('tool-')) continue;
        const id = (part.toolCallId as string) ?? '';
        if (!id || handledWrites.current.has(id)) continue;
        const out = part.output as ToolOutput | undefined;
        if (out?.navigateTo) {
          handledWrites.current.add(id);
          navigateTo = out.navigateTo;
        } else if (out?.updated) {
          handledWrites.current.add(id);
          shouldRefresh = true;
        }
      }
    }
    if (navigateTo) router.push(navigateTo);
    else if (shouldRefresh && filingId) router.refresh();
  }, [messages, filingId, router]);

  const onOpen = () => {
    setOpen(true);
    trackEvent('assistant_opened', { inWizard: !!filingId });
  };

  return (
    <>
      {!open && (
        <button
          type="button"
          onClick={onOpen}
          aria-label={t('launcherLabel')}
          className="fixed bottom-5 right-5 z-50 inline-flex h-14 w-14 items-center justify-center rounded-full bg-primary text-white shadow-lg transition-transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:ring-offset-2"
        >
          <MessageCircle className="h-6 w-6" />
        </button>
      )}

      {open && (
        <div className="fixed bottom-5 right-5 z-50 flex h-[min(70vh,560px)] w-[min(92vw,400px)] flex-col rounded-2xl border border-border bg-white shadow-2xl">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Sparkles className="h-4 w-4" />
              </span>
              <span className="font-semibold text-ink text-sm">{t('title')}</span>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label={t('close')}
              className="text-ink-subtle hover:text-ink rounded-md p-1 hover:bg-muted"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
            {messages.length === 0 && (
              <div className="space-y-3">
                <div className="rounded-2xl rounded-tl-sm bg-muted px-3 py-2 text-sm text-ink">
                  {t('greeting')}
                </div>
                <button
                  type="button"
                  onClick={() => send(t('guidedPrompt'))}
                  className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/5 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/10"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  {t('guidedButton')}
                </button>
              </div>
            )}

            {messages.map((m) => (
              <MessageBubble key={m.id} role={m.role} parts={m.parts} onOpenLink={(url) => {
                trackEvent('assistant_cta_clicked', { url });
                router.push(url);
                setOpen(false);
              }} />
            ))}

            {busy && (
              <div className="flex items-center gap-2 text-xs text-ink-subtle">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                {t('thinking')}
              </div>
            )}
          </div>

          {/* Composer */}
          <div className="border-t border-border p-3">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                send(input);
              }}
              className="flex items-end gap-2"
            >
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    send(input);
                  }
                }}
                rows={1}
                placeholder={t('placeholder')}
                className="max-h-28 min-h-[40px] flex-1 resize-none rounded-lg border border-border px-3 py-2 text-sm text-ink focus:border-primary/40 focus:outline-none focus:ring-1 focus:ring-primary/30"
              />
              <button
                type="submit"
                disabled={busy || !input.trim()}
                aria-label={t('send')}
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary text-white disabled:opacity-40"
              >
                <Send className="h-4 w-4" />
              </button>
            </form>
            <p className="mt-2 text-center text-[10px] leading-snug text-ink-subtle">
              {t('disclaimer')}
            </p>
          </div>
        </div>
      )}
    </>
  );
}

function MessageBubble({
  role,
  parts,
  onOpenLink,
}: {
  role: string;
  parts: unknown;
  onOpenLink: (url: string) => void;
}) {
  const isUser = role === 'user';
  const arr = (Array.isArray(parts) ? parts : []) as Array<Record<string, unknown>>;

  const textChunks: string[] = [];
  const cards: Array<{ id: string; output: ToolOutput }> = [];
  for (const part of arr) {
    const type = part.type as string | undefined;
    if (type === 'text' && typeof part.text === 'string') {
      textChunks.push(part.text);
    } else if (type?.startsWith('tool-')) {
      const out = part.output as ToolOutput | undefined;
      if (out && (out.url || out.updated || out.reason || out.message)) {
        cards.push({ id: (part.toolCallId as string) ?? Math.random().toString(36), output: out });
      }
    }
  }
  const text = textChunks.join('').trim();

  return (
    <div className={cn('flex flex-col gap-2', isUser ? 'items-end' : 'items-start')}>
      {text &&
        (isUser ? (
          <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-tr-sm bg-primary px-3 py-2 text-sm text-white">
            {text}
          </div>
        ) : (
          <div className="assistant-md max-w-[85%] rounded-2xl rounded-tl-sm bg-muted px-3 py-2 text-sm text-ink">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                p: ({ children }) => <p className="mb-2 last:mb-0 leading-snug">{children}</p>,
                ul: ({ children }) => <ul className="mb-2 list-disc pl-4 space-y-0.5 last:mb-0">{children}</ul>,
                ol: ({ children }) => <ol className="mb-2 list-decimal pl-4 space-y-0.5 last:mb-0">{children}</ol>,
                li: ({ children }) => <li className="leading-snug">{children}</li>,
                strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
                code: ({ children }) => (
                  <code className="rounded bg-black/5 px-1 py-0.5 text-[0.85em] font-mono">{children}</code>
                ),
                a: ({ href, children }) => {
                  const url = href ?? '';
                  const internal = url.startsWith('/');
                  return (
                    <a
                      href={url}
                      onClick={(e) => {
                        if (internal) {
                          e.preventDefault();
                          onOpenLink(url);
                        }
                      }}
                      target={internal ? undefined : '_blank'}
                      rel={internal ? undefined : 'noopener noreferrer'}
                      className="font-medium text-primary underline underline-offset-2"
                    >
                      {children}
                    </a>
                  );
                },
              }}
            >
              {text}
            </ReactMarkdown>
          </div>
        ))}
      {cards.map((c) => (
        <ToolCard key={c.id} output={c.output} onOpenLink={onOpenLink} />
      ))}
    </div>
  );
}

function ToolCard({ output, onOpenLink }: { output: ToolOutput; onOpenLink: (url: string) => void }) {
  // Write confirmation chip.
  if (output.updated) {
    return (
      <div className="inline-flex items-center gap-1.5 rounded-full bg-success/10 px-3 py-1 text-xs font-medium text-success">
        ✓ {output.updated}
        {output.value ? `: ${output.value}` : ''}
      </div>
    );
  }
  // Action / CTA card (start filing, add-on suggestion).
  if (output.url) {
    return (
      <button
        type="button"
        onClick={() => onOpenLink(output.url!)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm font-medium text-primary hover:bg-primary/10"
      >
        {output.reason || 'Continue'}
        <ArrowRight className="h-3.5 w-3.5" />
      </button>
    );
  }
  return null;
}
