'use client';

import Link from 'next/link';
import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Menu, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Logo } from './Logo';
import { LanguageSwitcher } from './LanguageSwitcher';
import { cn } from '@/lib/utils';

interface NavBarProps {
  isAuthed?: boolean;
  isAdmin?: boolean;
}

export function NavBar({ isAuthed = false, isAdmin = false }: NavBarProps) {
  const t = useTranslations('nav');
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const NAV_LINKS = [
    { href: '/pricing', label: t('pricing') },
    { href: '/services', label: t('services') },
    { href: '/file-annual-report', label: t('annualReport') },
    { href: '/about', label: t('about') },
    { href: '/faq', label: t('faq') },
  ];

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 16);
    onScroll();
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  return (
    <header
      className={cn(
        'sticky top-0 z-40 w-full transition-all duration-300',
        scrolled ? 'bg-white/80 backdrop-blur-xl border-b border-border shadow-sm' : 'bg-transparent'
      )}
    >
      <div className="container flex h-16 items-center justify-between">
        <Logo />

        <nav className="hidden md:flex items-center gap-1">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                'px-4 py-2 text-sm font-medium rounded-md transition-colors',
                pathname === link.href
                  ? 'text-primary bg-primary/5'
                  : 'text-ink-muted hover:text-ink hover:bg-muted'
              )}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="hidden md:flex items-center gap-2">
          <LanguageSwitcher />
          {isAuthed ? (
            <>
              {isAdmin && (
                <Button asChild variant="ghost" size="sm">
                  <Link href="/admin">{t('admin')}</Link>
                </Button>
              )}
              <Button asChild variant="ghost" size="sm">
                <Link href="/dashboard">{t('dashboard')}</Link>
              </Button>
              <Button asChild>
                <Link href="/dashboard">{t('continueFiling')}</Link>
              </Button>
            </>
          ) : (
            <>
              <Button asChild variant="ghost" size="sm">
                <Link href="/sign-in">{t('signIn')}</Link>
              </Button>
              <Button asChild>
                <Link href="/sign-up">{t('startFiling')}</Link>
              </Button>
            </>
          )}
        </div>

        <button
          className="md:hidden p-2 rounded-md hover:bg-muted"
          onClick={() => setMobileOpen((v) => !v)}
          aria-label="Toggle navigation"
        >
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {mobileOpen && (
        <div className="md:hidden border-t border-border bg-white">
          <div className="container py-4 flex flex-col gap-1">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  'px-4 py-3 text-base font-medium rounded-md',
                  pathname === link.href ? 'text-primary bg-primary/5' : 'text-ink hover:bg-muted'
                )}
              >
                {link.label}
              </Link>
            ))}
            <div className="border-t border-border mt-2 pt-3 flex flex-col gap-2">
              <LanguageSwitcher variant="full" className="w-full justify-start" />
              {isAuthed ? (
                <Button asChild variant="outline">
                  <Link href="/dashboard">{t('dashboard')}</Link>
                </Button>
              ) : (
                <>
                  <Button asChild variant="outline">
                    <Link href="/sign-in">{t('signIn')}</Link>
                  </Button>
                  <Button asChild>
                    <Link href="/sign-up">{t('startFiling')}</Link>
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
