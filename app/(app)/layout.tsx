import type { Metadata } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { redirectLocalized } from '@/lib/locale-redirect';
import { DashboardNav } from '@/components/dashboard/DashboardNav';
import { SkipLink } from '@/components/a11y/SkipLink';
import { ChatWidget } from '@/components/assistant/ChatWidget';

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) return await redirectLocalized('/sign-in');
  const [locale, messages] = await Promise.all([getLocale(), getMessages()]);

  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <div className="min-h-screen w-full min-w-0 max-w-full flex flex-col md:flex-row bg-surface">
        <SkipLink />
        <DashboardNav
          isAdmin={session.user.role === 'ADMIN'}
          user={{ name: session.user.name, email: session.user.email }}
        />
        <main id="main-content" tabIndex={-1} className="flex-1 w-full min-w-0 max-w-full overflow-x-clip focus:outline-none">
          {children}
        </main>
        <ChatWidget />
      </div>
    </NextIntlClientProvider>
  );
}
