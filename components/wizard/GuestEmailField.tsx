'use client';

import { useTranslations } from 'next-intl';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/** Inline email for a guest draft. Password waits until checkout. */
export function GuestEmailField({
  value,
  onChange,
  error,
}: {
  value: string;
  onChange: (value: string) => void;
  error?: string | null;
}) {
  const t = useTranslations('wizard');
  const invalid = Boolean(error);
  return (
    <div className="space-y-1.5">
      <Label htmlFor="guest-email">{t('guestEmailLabel')}</Label>
      <Input
        id="guest-email"
        name="guestEmail"
        type="email"
        autoComplete="email"
        inputMode="email"
        placeholder={t('guestEmailPlaceholder')}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={invalid}
      />
      {invalid ? (
        <p className="text-xs text-destructive">{error}</p>
      ) : (
        <p className="text-[11px] text-ink-subtle">{t('guestEmailHint')}</p>
      )}
    </div>
  );
}
