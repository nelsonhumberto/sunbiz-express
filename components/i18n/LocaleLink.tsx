'use client';

import Link from 'next/link';
import type { ComponentProps } from 'react';
import { isSpanishPublicPath } from '@/lib/locale-paths';

type Props = Omit<ComponentProps<typeof Link>, 'prefetch' | 'href'> & {
  href: string;
};

/**
 * Link to the other language. Prefetch stays off so a viewport fetch of /es
 * cannot run before the click. The click updates <html lang> immediately.
 */
export function LocaleLink({ href, onClick, ...rest }: Props) {
  return (
    <Link
      href={href}
      prefetch={false}
      onClick={(event) => {
        const path = href.split(/[?#]/)[0] || '/';
        document.documentElement.lang = isSpanishPublicPath(path) ? 'es' : 'en';
        onClick?.(event);
      }}
      {...rest}
    />
  );
}
