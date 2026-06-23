'use client';

import { useLocale, useTranslations } from 'next-intl';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { getMarketingFaq } from '@/lib/marketing-faq';
import { FLORIDA, type MarketingState } from '@/lib/marketing-states';
import { JsonLd, faqPageJsonLd } from '@/components/seo/JsonLd';

interface FAQSectionProps {
  /** Resolved marketing state. Defaults to Florida for backwards compatibility. */
  state?: MarketingState;
  /**
   * Suppress the section's internal heading. Set when the FAQ section is
   * rendered directly under an `<h1>` that already announces the same
   * topic (e.g. on `/faq`), so we don't emit a duplicate `<h2>` flagged
   * by the May 2026 accessibility audit.
   */
  hideHeading?: boolean;
  /**
   * Open every answer by default and keep them all expandable. Used on the
   * dedicated `/faq` page so every objection is immediately visible (and
   * reliably crawlable), rather than only the first answer.
   */
  expandAll?: boolean;
  /**
   * Suppress the inline FAQPage JSON-LD. Set when the parent page already
   * emits the structured data server-side to avoid duplicate schema.
   */
  suppressJsonLd?: boolean;
}

export function FAQSection({
  state = FLORIDA,
  hideHeading,
  expandAll,
  suppressJsonLd,
}: FAQSectionProps) {
  const t = useTranslations('faq');
  const tComingSoon = useTranslations('comingSoon');
  const locale = useLocale();
  const faqItems = getMarketingFaq(state, locale);
  const isActive = state.availability === 'active';
  const stateName = locale === 'es' ? state.nameEs : state.name;
  const allValues = faqItems.map((_, i) => `item-${i}`);

  return (
    <section className="py-20 md:py-28">
      {isActive && !suppressJsonLd && <JsonLd data={faqPageJsonLd(faqItems)} />}
      <div className="container max-w-3xl">
        {!hideHeading && (
          <div className="text-center mb-12">
            <span className="text-xs font-semibold uppercase tracking-wider text-primary">
              {isActive ? t('kicker') : tComingSoon('faqEyebrow')}
            </span>
            <h2 className="mt-3 font-display text-4xl md:text-5xl font-medium tracking-tight">
              {isActive
                ? t('headline')
                : tComingSoon('faqHeadline', { state: stateName })}
            </h2>
          </div>
        )}

        {expandAll ? (
          <Accordion
            type="multiple"
            defaultValue={allValues}
            className="rounded-2xl border border-border bg-white px-6 shadow-soft"
          >
            {faqItems.map((item, i) => (
              <AccordionItem
                key={i}
                value={`item-${i}`}
                {...(item.id ? { id: item.id } : {})}
                className={item.id ? 'scroll-mt-24' : undefined}
              >
                <AccordionTrigger>{item.q}</AccordionTrigger>
                <AccordionContent>{item.a}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        ) : (
        <Accordion type="single" collapsible defaultValue="item-0" className="rounded-2xl border border-border bg-white px-6 shadow-soft">
          {faqItems.map((item, i) => (
            <AccordionItem
              key={i}
              value={`item-${i}`}
              // Scroll-target anchor for inbound footer/dashboard links like
              // `/faq#ein` or `/faq#boi`. Items without an `id` rely only on
              // their positional value above.
              {...(item.id ? { id: item.id } : {})}
              className={item.id ? 'scroll-mt-24' : undefined}
            >
              <AccordionTrigger>{item.q}</AccordionTrigger>
              <AccordionContent>{item.a}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
        )}

        <p className="mt-8 text-center text-sm text-ink-muted">
          {t('stillHaveQuestions')}{' '}
          <a href="mailto:hello@launchforma.com" className="text-primary font-medium hover:underline">
            {t('emailUs')}
          </a>{' '}
          {t('respondWithin')}
        </p>
      </div>
    </section>
  );
}
