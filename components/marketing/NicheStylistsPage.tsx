import { ArrowRight, Check } from 'lucide-react';
import { JsonLd, faqPageJsonLd } from '@/components/seo/JsonLd';
import {
  inlineParts,
  nicheVisibleFaq,
  type NicheBundleCopy,
  type NicheStylistsCopy,
} from '@/lib/niche-stylists';

function InlineCopy({ text }: { text: string }) {
  const parts = inlineParts(text);
  return (
    <>
      {parts.map((part, index) =>
        part.type === 'link' && part.href ? (
          <a
            key={`${part.href}-${index}`}
            href={part.href}
            className="font-medium text-primary underline-offset-4 hover:underline break-words [overflow-wrap:anywhere]"
          >
            {part.text}
          </a>
        ) : (
          <span key={`text-${index}`}>{part.text}</span>
        ),
      )}
    </>
  );
}

function CtaLink({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      className="inline-flex max-w-full items-center justify-center gap-2 whitespace-normal rounded-xl bg-primary px-6 py-3.5 text-center text-base font-semibold leading-snug text-white shadow-sm hover:bg-primary-hover"
    >
      {label}
      <ArrowRight className="h-4 w-4 shrink-0" aria-hidden="true" />
    </a>
  );
}

export function NicheStylistsPage({
  copy,
  bundle,
}: {
  copy: NicheStylistsCopy;
  bundle: NicheBundleCopy | null;
}) {
  const faq = nicheVisibleFaq(copy);

  return (
    <div className="min-w-0">
      <JsonLd data={faqPageJsonLd(faq, { inLanguage: copy.locale })} />

      <section className="relative overflow-hidden pt-12 pb-14 md:pt-20 md:pb-20">
        <div className="absolute inset-0 mesh-bg" />
        <div className="aurora" />
        <div className="container relative max-w-3xl text-center">
          <h1 className="text-balance font-display text-4xl font-medium leading-[1.08] tracking-tight sm:text-5xl md:text-6xl">
            {copy.h1}
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-pretty text-base leading-relaxed text-ink-muted md:text-lg">
            {copy.subhead}
          </p>
          <div className="mt-8">
            <CtaLink href={copy.ctaHref} label={copy.ctaLabel} />
          </div>
        </div>
      </section>

      <section className="py-12 md:py-16">
        <div className="container max-w-3xl">
          <h2 className="text-balance font-display text-3xl font-medium tracking-tight md:text-4xl">
            {copy.bossTitle}
          </h2>
          <p className="mt-4 text-base leading-relaxed text-ink-muted">{copy.bossBody}</p>
        </div>
      </section>

      <section className="border-y border-border bg-white py-12 md:py-16">
        <div className="container max-w-5xl">
          <h2 className="mx-auto max-w-3xl text-balance text-center font-display text-3xl font-medium tracking-tight md:text-4xl">
            {copy.benefitsTitle}
          </h2>
          <ul className="mt-8 grid list-none grid-cols-1 gap-4 md:grid-cols-2">
            {copy.benefits.map((item) => (
              <li
                key={item.title}
                className="min-w-0 rounded-2xl border border-border bg-white p-6 shadow-soft"
              >
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <h3 className="font-display text-lg font-semibold leading-snug text-ink">
                      {item.title}
                    </h3>
                    <p className="mt-2 text-sm leading-relaxed text-ink-muted">{item.body}</p>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="py-12 md:py-16">
        <div className="container max-w-3xl">
          <div className="rounded-2xl border border-border bg-muted/40 p-6 md:p-8">
            <h2 className="text-balance font-display text-2xl font-medium tracking-tight md:text-3xl">
              {copy.licenseTitle}
            </h2>
            <p className="mt-3 text-base leading-relaxed text-ink-muted">{copy.licenseBody}</p>
          </div>
        </div>
      </section>

      <section className="pb-12 md:pb-16">
        <div className="container max-w-3xl">
          <h2 className="text-balance font-display text-3xl font-medium tracking-tight md:text-4xl">
            {copy.essentialTitle}
          </h2>
          <p className="mt-4 text-base leading-relaxed text-ink-muted">{copy.essentialBody}</p>
          <div className="mt-6">
            <CtaLink href={copy.ctaHref} label={copy.ctaLabel} />
          </div>
        </div>
      </section>

      {bundle ? (
        <section className="pb-12 md:pb-16" data-bundle-block="true">
          <div className="container max-w-3xl">
            <div className="rounded-2xl border border-primary/20 bg-primary/5 p-6 md:p-8">
              <h2 className="text-balance font-display text-2xl font-medium tracking-tight md:text-3xl">
                {bundle.title}
              </h2>
              <p className="mt-3 text-base leading-relaxed text-ink-muted">
                <InlineCopy text={bundle.body} />
              </p>
            </div>
          </div>
        </section>
      ) : null}

      <section className="border-t border-border py-12 md:py-16">
        <div className="container max-w-5xl">
          <h2 className="text-balance text-center font-display text-3xl font-medium tracking-tight md:text-4xl">
            {copy.howTitle}
          </h2>
          <ol className="mt-8 grid list-none grid-cols-1 gap-4 md:grid-cols-3">
            {copy.steps.map((step, index) => (
              <li
                key={step.title}
                className="min-w-0 rounded-2xl border border-border bg-white p-6 shadow-soft"
              >
                <span className="font-display text-3xl font-medium text-primary/30">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <h3 className="mt-3 font-display text-lg font-semibold leading-snug">{step.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-muted break-words">
                  {step.body}
                </p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="pb-12 md:pb-16">
        <div className="container max-w-3xl">
          <h2 className="text-balance font-display text-3xl font-medium tracking-tight md:text-4xl">
            {copy.toolsTitle}
          </h2>
          <ul className="mt-5 list-disc space-y-3 pl-5">
            {copy.tools.map((tool) => (
              <li key={tool.href} className="min-w-0">
                <a
                  href={tool.href}
                  className="font-medium text-primary underline-offset-4 hover:underline break-words [overflow-wrap:anywhere]"
                >
                  {tool.label}
                </a>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="pb-12 md:pb-16" aria-labelledby="niche-faq">
        <div className="container max-w-3xl">
          <h2
            id="niche-faq"
            className="text-balance font-display text-3xl font-medium tracking-tight md:text-4xl"
          >
            {copy.faqTitle}
          </h2>
          <div className="mt-6 divide-y divide-border rounded-2xl border border-border bg-white px-6 shadow-soft">
            {copy.faq.map((item) => (
              <div key={item.q} className="py-5" data-faq-item="true">
                <h3 className="font-display text-base font-semibold leading-snug" data-faq-q="true">
                  {item.q}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-muted" data-faq-a="true">
                  <InlineCopy text={item.a} />
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="overflow-hidden py-12 md:py-20">
        <div className="container">
          <div className="mx-auto max-w-3xl rounded-3xl bg-gradient-to-br from-primary via-primary-hover to-primary-700 p-8 text-white md:p-12">
            <h2 className="text-balance font-display text-3xl font-medium tracking-tight md:text-4xl">
              {copy.readyTitle}
            </h2>
            <p className="mt-3 max-w-xl text-base leading-relaxed text-white/85">{copy.readyBody}</p>
            <div className="mt-6">
              <a
                href={copy.ctaHref}
                className="inline-flex max-w-full items-center justify-center gap-2 whitespace-normal rounded-xl bg-white px-6 py-3.5 text-center text-base font-semibold leading-snug text-primary shadow-sm hover:bg-white/90"
              >
                {copy.ctaLabel}
                <ArrowRight className="h-4 w-4 shrink-0" aria-hidden="true" />
              </a>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
