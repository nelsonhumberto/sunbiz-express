'use client';

import { useEffect, useState } from 'react';
import { spanishOfferFor } from '@/lib/spanish-offer';
import { cn } from '@/lib/utils';

/**
 * Client-only. The first paint stays empty so the fold does not move.
 * A normal anchor does a full load. There is no redirect and no analytics call.
 */
export function VerEnEspanolLink({ className }: { className: string }) {
  const [href, setHref] = useState<string | null>(null);

  useEffect(() => {
    const nav = window.navigator;
    const languages =
      nav.languages && nav.languages.length > 0
        ? nav.languages
        : nav.language
          ? [nav.language]
          : [];
    setHref(
      spanishOfferFor({
        pathname: window.location.pathname,
        search: window.location.search,
        languages,
      })?.href ?? null,
    );
  }, []);

  if (!href) return null;

  return (
    <a
      href={href}
      lang="es"
      hrefLang="es"
      translate="no"
      className={cn('notranslate', className)}
    >
      Ver en español
    </a>
  );
}
