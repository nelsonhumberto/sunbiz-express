'use client';

import { useTransition } from 'react';
import { useLocale } from 'next-intl';
import { Globe, Check } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { setLocaleAction } from '@/actions/locale';
import { locales, localeNames, localeFlags, type Locale } from '@/i18n/config';
import { cn } from '@/lib/utils';

interface Props {
  variant?: 'icon' | 'full';
  className?: string;
}

export function LanguageSwitcher({ variant = 'icon', className }: Props) {
  const currentLocale = useLocale() as Locale;
  const [pending, start] = useTransition();

  const switchLocale = (locale: Locale) => {
    if (locale === currentLocale) return;
    start(async () => {
      await setLocaleAction(locale);
    });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            'inline-flex items-center gap-1.5 px-2.5 h-9 rounded-md text-sm font-medium text-ink-muted hover:bg-muted hover:text-ink transition-colors disabled:opacity-60',
            variant === 'full' && 'px-3',
            className
          )}
          disabled={pending}
          aria-label="Change language"
        >
          <Globe className="h-4 w-4" />
          {variant === 'full' ? (
            <span>{localeNames[currentLocale]}</span>
          ) : (
            <span className="text-xs uppercase tracking-wider">{currentLocale}</span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[160px]">
        {locales.map((locale) => (
          <DropdownMenuItem
            key={locale}
            onClick={() => switchLocale(locale)}
            className="cursor-pointer"
          >
            <span className="mr-2 text-base leading-none">{localeFlags[locale]}</span>
            <span className="flex-1">{localeNames[locale]}</span>
            {currentLocale === locale && <Check className="h-3.5 w-3.5 text-primary" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
