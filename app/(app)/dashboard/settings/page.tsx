import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Mail, Phone, ShieldCheck, KeyRound, CreditCard } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { Card, CardContent } from '@/components/ui/card';
import { AccountSettingsForm } from '@/components/dashboard/AccountSettingsForm';
import { ChangePasswordForm } from '@/components/dashboard/ChangePasswordForm';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Account settings' };

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/sign-in');

  const t = await getTranslations('dashboard');
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      phone: true,
      createdAt: true,
      stripeCustomerId: true,
    },
  });
  if (!user) redirect('/sign-in');

  return (
    <div className="container max-w-3xl py-10 space-y-8">
      <div>
        <h1 className="font-display text-4xl font-medium tracking-tight">
          {t('settingsTitle')}
        </h1>
        <p className="mt-2 text-ink-muted">{t('settingsSubtitle')}</p>
      </div>

      {/* Contact info */}
      <Card>
        <CardContent className="p-6 space-y-5">
          <div>
            <h2 className="font-semibold text-ink">{t('contactInfoTitle')}</h2>
            <p className="text-sm text-ink-muted">{t('contactInfoSubtitle')}</p>
          </div>
          <div className="text-sm text-ink-muted flex flex-wrap items-center gap-4">
            <span className="inline-flex items-center gap-2">
              <Mail className="h-4 w-4 text-ink-subtle" />
              {user.email}
            </span>
            <span className="text-xs text-ink-subtle">
              {t('emailLockedHint')}
            </span>
          </div>
          <AccountSettingsForm
            defaultValues={{
              firstName: user.firstName,
              lastName: user.lastName,
              phone: user.phone ?? '',
            }}
          />
        </CardContent>
      </Card>

      {/* Password */}
      <Card>
        <CardContent className="p-6 space-y-5">
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <KeyRound className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-semibold text-ink">{t('passwordTitle')}</h2>
              <p className="text-sm text-ink-muted">{t('passwordSubtitle')}</p>
            </div>
          </div>
          <ChangePasswordForm />
        </CardContent>
      </Card>

      {/* Billing pointer */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <CreditCard className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <h2 className="font-semibold text-ink">{t('billingTitle')}</h2>
              <p className="text-sm text-ink-muted">{t('billingSubtitle')}</p>
              <Link
                href="/dashboard/billing"
                className="inline-flex items-center gap-1.5 mt-3 text-sm font-semibold text-primary hover:underline"
              >
                {t('openBilling')}
              </Link>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Account meta */}
      <div className="rounded-xl border border-border bg-muted/30 p-4 text-xs text-ink-subtle">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <span className="inline-flex items-center gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5" />
            {t('accountSecure')}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Phone className="h-3.5 w-3.5" />
            {t('contactSupport')}{' '}
            <a
              href="mailto:help@launchforma.com"
              className="underline text-ink-muted"
            >
              help@launchforma.com
            </a>
          </span>
          <span className="ml-auto">
            {t('memberSince', {
              date: user.createdAt.toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
              }),
            })}
          </span>
        </div>
      </div>
    </div>
  );
}
