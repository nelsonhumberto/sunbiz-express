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

interface FAQSectionProps {
  /** Resolved marketing state. Defaults to Florida for backwards compatibility. */
  state?: MarketingState;
}

export function FAQSection({ state = FLORIDA }: FAQSectionProps) {
  const t = useTranslations('faq');
  const tComingSoon = useTranslations('comingSoon');
  const locale = useLocale();
  const faqItems = getMarketingFaq(state, locale);
  const isActive = state.availability === 'active';
  const stateName = locale === 'es' ? state.nameEs : state.name;

  return (
    <section className="py-20 md:py-28">
      <div className="container max-w-3xl">
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

        <Accordion type="single" collapsible className="rounded-2xl border border-border bg-white px-6 shadow-soft">
          {faqItems.map((item, i) => (
            <AccordionItem key={i} value={`item-${i}`}>
              <AccordionTrigger>{item.q}</AccordionTrigger>
              <AccordionContent>{item.a}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>

        <p className="mt-8 text-center text-sm text-ink-muted">
          {t('stillHaveQuestions')}{' '}
          <a href="mailto:hello@incservices.example" className="text-primary font-medium hover:underline">
            {t('emailUs')}
          </a>{' '}
          {t('respondWithin')}
        </p>
      </div>
    </section>
  );
}
