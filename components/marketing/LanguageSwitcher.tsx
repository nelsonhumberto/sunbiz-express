'use client';

import { useTransition } from 'react';
import { usePathname } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { Globe, Check } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { setLocaleAction } from '@/actions/locale';
import { locales, localeNames, localeFlags, type Locale } from '@/i18n/config';
import { pathForLocale } from '@/lib/locale-paths';
import { isSpanishOnlyGuidePath } from '@/lib/spanish-guide-links';
import { cn } from '@/lib/utils';

interface Props {
  variant?: 'icon' | 'full';
  className?: string;
}

export function LanguageSwitcher({ variant = 'icon', className }: Props) {
  const currentLocale = useLocale() as Locale;
  const tNav = useTranslations('nav');
  const pathname = usePathname() ?? '';
  const spanishOnly = isSpanishOnlyGuidePath(pathname);
  const [pending, start] = useTransition();

  const switchLocale = (locale: Locale) => {
    if (locale === currentLocale) return;
    document.documentElement.lang = locale;
    const params = new URLSearchParams(window.location.search);
    params.delete('lang');
    const qs = params.toString();
    const nextPath = pathForLocale(window.location.pathname, locale);
    const href = `${nextPath}${qs ? `?${qs}` : ''}${window.location.hash}`;
    start(async () => {
      await setLocaleAction(locale);
      // A client navigation can reuse a cached RSC payload for the rewritten
      // route, so the URL changes and the copy stays put. A full load does not.
      window.location.assign(href);
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
          aria-label={tNav('changeLanguage')}
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
        {locales.map((locale) => {
          const blocked = spanishOnly && locale === 'en';
          return (
            <DropdownMenuItem
              key={locale}
              onClick={() => {
                if (!blocked) switchLocale(locale);
              }}
              disabled={blocked}
              className={blocked ? 'cursor-not-allowed opacity-70' : 'cursor-pointer'}
            >
              <span className="mr-2 text-base leading-none">{localeFlags[locale]}</span>
              <span className="flex-1">{blocked ? 'Solo en español' : localeNames[locale]}</span>
              {currentLocale === locale && !blocked && <Check className="h-3.5 w-3.5 text-primary" />}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
