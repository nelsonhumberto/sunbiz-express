'use client';

import { useEffect, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { submitServiceInquiry } from '@/actions/service-inquiry';
import { identifyUser, trackEvent } from '@/lib/analytics';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  SERVICE_INQUIRY_OPTIONS,
  isServiceInquiryOption,
  type ServiceInquiryOption,
} from '@/lib/service-inquiry';

const SERVICE_LABEL_KEY = {
  registered_agent: 'serviceRegisteredAgent',
  operating_agreement: 'serviceOperatingAgreement',
  compliance_alerts: 'serviceComplianceAlerts',
  other: 'serviceOther',
} as const;

export function ServiceInquiryForm() {
  const t = useTranslations('businessServices');
  const locale = useLocale();
  const [service, setService] = useState<ServiceInquiryOption>('registered_agent');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<'invalid' | 'generic' | null>(null);
  const formStarted = useRef(false);
  const formLocale = locale === 'es' ? 'es' : 'en';

  function onFormFocus(event: React.FocusEvent<HTMLFormElement>) {
    if (formStarted.current) return;
    const target = event.target;
    if (target instanceof HTMLElement && target.getAttribute('name') === 'website') return;
    formStarted.current = true;
    trackEvent('form_started', {
      form: 'service_inquiry',
      locale: formLocale,
      service,
    });
  }

  useEffect(() => {
    const onPick = (event: Event) => {
      const detail = (event as CustomEvent<string>).detail;
      if (isServiceInquiryOption(detail)) setService(detail);
    };
    window.addEventListener('lf-inquiry-service', onPick);
    return () => window.removeEventListener('lf-inquiry-service', onPick);
  }, []);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError(null);

    const form = event.currentTarget;
    const data = new FormData(form);
    const result = await submitServiceInquiry({
      name: String(data.get('name') ?? ''),
      email: String(data.get('email') ?? ''),
      phone: String(data.get('phone') ?? ''),
      service,
      message: String(data.get('message') ?? ''),
      locale: locale === 'es' ? 'es' : 'en',
      website: String(data.get('website') ?? ''),
    });

    if (!result.ok) {
      setPending(false);
      setError(result.error);
      return;
    }
    if (!result.stored) {
      setPending(false);
      form.reset();
      return;
    }

    const email = String(data.get('email') ?? '').trim().toLowerCase();
    if (email) identifyUser(email, { email });
    trackEvent(
      'lead_submitted',
      { form: 'service_inquiry', locale: formLocale, service },
      { sendInstantly: true },
    );

    const params = new URLSearchParams({ service, lead: '1' });
    const path =
      locale === 'es'
        ? `/es/business-services/thank-you?${params}`
        : `/business-services/thank-you?${params}`;
    window.location.assign(path);
  }

  return (
    <form
      onSubmit={onSubmit}
      onFocus={onFormFocus}
      className="relative mt-8 space-y-4"
      noValidate
    >
      <div className="absolute -left-[9999px] h-0 w-0 overflow-hidden" aria-hidden="true">
        <label>
          Website
          <input name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>

      <Field label={t('nameLabel')} htmlFor="inquiry-name">
        <Input id="inquiry-name" name="name" autoComplete="name" required maxLength={120} />
      </Field>
      <Field label={t('emailLabel')} htmlFor="inquiry-email">
        <Input
          id="inquiry-email"
          name="email"
          type="email"
          autoComplete="email"
          required
          maxLength={254}
        />
      </Field>
      <Field label={t('phoneLabel')} htmlFor="inquiry-phone">
        <Input
          id="inquiry-phone"
          name="phone"
          type="tel"
          autoComplete="tel"
          required
          maxLength={32}
        />
      </Field>
      <Field label={t('serviceLabel')} htmlFor="inquiry-service">
        <select
          id="inquiry-service"
          name="service"
          required
          value={service}
          onChange={(event) => {
            if (isServiceInquiryOption(event.target.value)) setService(event.target.value);
          }}
          className="flex h-11 w-full rounded-md border border-input bg-card px-4 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:border-primary"
        >
          {SERVICE_INQUIRY_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {t(SERVICE_LABEL_KEY[option])}
            </option>
          ))}
        </select>
      </Field>
      <Field label={t('messageLabel')} htmlFor="inquiry-message">
        <textarea
          id="inquiry-message"
          name="message"
          rows={4}
          maxLength={2000}
          placeholder={t('messagePlaceholder')}
          className="flex w-full rounded-md border border-input bg-card px-4 py-3 text-sm shadow-sm placeholder:text-ink-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:border-primary"
        />
      </Field>

      {error ? (
        <p role="alert" className="text-sm font-medium text-red-700">
          {error === 'invalid' ? t('errorInvalid') : t('errorGeneric')}
        </p>
      ) : null}

      <Button type="submit" size="lg" className="w-full sm:w-auto" disabled={pending}>
        {pending ? t('submitting') : t('submit')}
      </Button>
    </form>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <label htmlFor={htmlFor} className="block">
      <span className="mb-1.5 block text-sm font-medium text-ink">{label}</span>
      {children}
    </label>
  );
}
