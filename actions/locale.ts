'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { locales, LOCALE_COOKIE, type Locale } from '@/i18n/config';

export async function setLocaleAction(locale: string) {
  if (!locales.includes(locale as Locale)) return;
  cookies().set(LOCALE_COOKIE, locale, {
    httpOnly: false,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 365, // 1 year
  });
  revalidatePath('/', 'layout');
}
