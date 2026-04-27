import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { Logo } from '@/components/marketing/Logo';
import { LanguageSwitcher } from '@/components/marketing/LanguageSwitcher';
import { COPYRIGHT_YEAR } from '@/lib/constants';

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const t = await getTranslations('auth');

  return (
    <div
      className="min-h-screen relative grid lg:grid-cols-5 bg-surface"
      suppressHydrationWarning
    >
      {/* Left: form */}
      <div className="lg:col-span-2 flex flex-col" suppressHydrationWarning>
        <header className="container py-6 flex items-center justify-between">
          <Logo />
          <LanguageSwitcher />
        </header>
        <div
          className="flex-1 flex items-center justify-center px-6 py-8"
          suppressHydrationWarning
        >
          <div className="w-full max-w-md" suppressHydrationWarning>
            {children}
          </div>
        </div>
        <footer className="container py-6 text-xs text-ink-subtle flex justify-between">
          <span>© {COPYRIGHT_YEAR} IncServices</span>
          <Link href="/" className="hover:text-ink-muted">
            {t('backToHome')}
          </Link>
        </footer>
      </div>

      {/* Right: pretty side panel */}
      <aside className="hidden lg:block lg:col-span-3 relative bg-gradient-to-br from-primary via-primary-hover to-primary-700 overflow-hidden">
        <div className="absolute inset-0 mesh-bg opacity-50" />
        <div className="absolute -top-32 -right-32 h-96 w-96 rounded-full bg-accent/30 blur-3xl" />
        <div className="absolute bottom-0 -left-32 h-96 w-96 rounded-full bg-primary-300/40 blur-3xl" />

        <div className="relative h-full flex flex-col justify-between p-12 text-white">
          <div className="space-y-4">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 backdrop-blur border border-white/20 text-xs font-medium">
              {t('sidePanelBadge')}
            </div>
            <h2 className="font-display text-4xl xl:text-5xl font-medium leading-tight max-w-md">
              {t('sidePanelHeadline')}
            </h2>
            <p className="text-lg text-white/85 max-w-md leading-relaxed">{t('sidePanelBody')}</p>
          </div>

          <ul className="space-y-3 max-w-sm">
            {[t('sidePanelFeature1'), t('sidePanelFeature2'), t('sidePanelFeature3'), t('sidePanelFeature4')].map(
              (feature) => (
                <li key={feature} className="flex items-center gap-3 text-sm text-white/90">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/15 backdrop-blur border border-white/20">
                    <svg className="h-3 w-3" viewBox="0 0 12 12" fill="none">
                      <path
                        d="M2 6l3 3 5-6"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </span>
                  {feature}
                </li>
              )
            )}
          </ul>

          <div className="space-y-2 max-w-sm">
            <div className="flex -space-x-2">
              {['M', 'C', 'J', 'A'].map((c) => (
                <div
                  key={c}
                  className="h-8 w-8 rounded-full bg-white/20 backdrop-blur border-2 border-primary flex items-center justify-center text-xs font-semibold"
                >
                  {c}
                </div>
              ))}
            </div>
            <p className="text-sm text-white/80">{t('sidePanelSocial')}</p>
          </div>
        </div>
      </aside>
    </div>
  );
}
