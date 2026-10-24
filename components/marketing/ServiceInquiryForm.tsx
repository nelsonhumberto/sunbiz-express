'use client';

import { useEffect, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { submitServiceInquiry } from '@/actions/service-inquiry';
import { trackEvent } from '@/lib/analytics';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  SERVICE_INQUIRY_OPTIONS,
  inquiryFieldErrors,
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
  const [service, setService] = useState<ServiceInquiryOption>('compliance_alerts');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<'invalid' | 'generic' | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{
    name?: true;
    phone?: true;
    service?: true;
  }>({});
  const [succeeded, setSucceeded] = useState(false);
  const formStarted = useRef(false);
  const formLocale = locale === 'es' ? 'es' : 'en';

  function onFormFocus(event: React.FocusEvent<HTMLFormElement>) {
    if (formStarted.current) return;
    const target = event.target;
    if (target instanceof HTMLElement && target.getAttribute('name') === 'lf_hp') return;
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
    if (pending || succeeded) return;

    const form = event.currentTarget;
    const data = new FormData(form);
    const name = String(data.get('name') ?? '');
    const phone = String(data.get('phone') ?? '');
    const issues = inquiryFieldErrors({ name, phone, service });
    if (issues.name || issues.phone || issues.service) {
      setFieldErrors(issues);
      setError('invalid');
      trackEvent('form_submitted', { service, success: false }, { sendInstantly: true });
      return;
    }

    setPending(true);
    setError(null);
    setFieldErrors({});

    let result: Awaited<ReturnType<typeof submitServiceInquiry>>;
    try {
      result = await submitServiceInquiry({
        name,
        phone,
        service,
        locale: formLocale,
        lf_hp: String(data.get('lf_hp') ?? ''),
      });
    } catch {
      setPending(false);
      setError('generic');
      trackEvent('form_submitted', { service, success: false }, { sendInstantly: true });
      return;
    }

    if (!result.ok) {
      setPending(false);
      setError(result.error);
      if (result.error === 'invalid') setFieldErrors(inquiryFieldErrors({ name, phone, service }));
      trackEvent('form_submitted', { service, success: false }, { sendInstantly: true });
      return;
    }
    if (!result.stored) {
      setPending(false);
      return;
    }

    trackEvent('form_submitted', { service, success: true }, { sendInstantly: true });
    setSucceeded(true);
    setPending(false);

    const params = new URLSearchParams({ service, lead: '1' });
    const path =
      locale === 'es'
        ? `/es/business-services/thank-you?${params}`
        : `/business-services/thank-you?${params}`;
    window.location.assign(path);
  }

  if (succeeded) {
    return (
      <div
        role="status"
        data-testid="service-inquiry-success"
        className="mt-8 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-4"
      >
        <p className="font-semibold text-emerald-950">{t('successHeadline')}</p>
        <p className="mt-1 text-sm text-emerald-900">{t('successBody')}</p>
      </div>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      onFocus={onFormFocus}
      className="relative mt-8 space-y-4"
      noValidate
      autoComplete="on"
      data-testid="service-inquiry-form"
    >
      <div className="absolute -left-[9999px] h-0 w-0 overflow-hidden" aria-hidden="true">
        <label>
          Company
          <input name="lf_hp" tabIndex={-1} autoComplete="off" defaultValue="" />
        </label>
      </div>

      <Field
        label={t('nameLabel')}
        htmlFor="inquiry-name"
        error={fieldErrors.name ? t('nameError') : undefined}
      >
        <Input
          id="inquiry-name"
          name="name"
          autoComplete="name"
          required
          maxLength={120}
          aria-invalid={fieldErrors.name ? true : undefined}
          className="h-12 text-base"
        />
      </Field>
      <Field
        label={t('phoneWhatsappLabel')}
        htmlFor="inquiry-phone"
        error={fieldErrors.phone ? t('phoneError') : undefined}
      >
        <Input
          id="inquiry-phone"
          name="phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          required
          maxLength={32}
          placeholder={t('phonePlaceholder')}
          aria-invalid={fieldErrors.phone ? true : undefined}
          className="h-12 text-base"
        />
      </Field>
      <Field
        label={t('serviceLabel')}
        htmlFor="inquiry-service"
        error={fieldErrors.service ? t('serviceError') : undefined}
      >
        <select
          id="inquiry-service"
          name="service"
          required
          value={service}
          aria-invalid={fieldErrors.service ? true : undefined}
          onChange={(event) => {
            if (isServiceInquiryOption(event.target.value)) setService(event.target.value);
          }}
          className="flex h-12 w-full rounded-md border border-input bg-card px-4 text-base shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:border-primary"
        >
          {SERVICE_INQUIRY_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {t(SERVICE_LABEL_KEY[option])}
            </option>
          ))}
        </select>
      </Field>

      {error ? (
        <p
          role="alert"
          data-testid="service-inquiry-error"
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800"
        >
          {error === 'invalid' ? t('errorInvalid') : t('errorGeneric')}
        </p>
      ) : null}

      <Button type="submit" size="lg" className="h-12 w-full text-base" disabled={pending}>
        {pending ? t('submitting') : t('submit')}
      </Button>
    </form>
  );
}

function Field({
  label,
  htmlFor,
  error,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  children: React.ReactNode;
}) {
  const errorId = `${htmlFor}-error`;
  return (
    <label htmlFor={htmlFor} className="block">
      <span className="mb-1.5 block text-sm font-medium text-ink">{label}</span>
      {children}
      {error ? (
        <span id={errorId} className="mt-1.5 block text-sm font-medium text-red-700">
          {error}
        </span>
      ) : null}
    </label>
  );
}
