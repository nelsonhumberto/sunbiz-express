import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { localizedHref } from '@/lib/locale-paths';
import { Logo } from './Logo';
import { BUSINESS_ADDRESS, BUSINESS_LEGAL_NAME, COPYRIGHT_YEAR } from '@/lib/constants';

export function Footer() {
  const tFooter = useTranslations('footer');
  const tNav = useTranslations('nav');
  const tDisc = useTranslations('disclosure');
  const locale = useLocale();
  const href = (path: string) => localizedHref(path, locale);

  const FOOTER_LINKS = {
    product: [
      { label: tFooter('formAnLLC'), href: href('/start?entity=LLC') },
      { label: tFooter('formACorp'), href: href('/start?entity=CORP') },
      { label: tNav('pricing'), href: href('/pricing') },
      { label: tFooter('registeredAgent'), href: href('/services#registered-agent') },
      { label: tFooter('complianceService'), href: href('/services#compliance') },
      { label: tFooter('statesWeServe'), href: href('/states') },
    ],
    company: [
      { label: tNav('about'), href: href('/about') },
      { label: tFooter('whyUs'), href: href('/about#why') },
      { label: tNav('faq'), href: href('/faq') },
      { label: tFooter('contact'), href: href('/about#contact') },
    ],
    legal: [
      { label: tFooter('terms'), href: href('/terms') },
      { label: tFooter('privacy'), href: href('/privacy') },
      { label: tFooter('disclaimer'), href: href('/disclaimer') },
      { label: tFooter('refundPolicy'), href: href('/refund-policy') },
    ],
    resources: [
      { label: tFooter('howToFormFloridaLlc'), href: href('/guides/how-to-form-an-llc-in-florida') },
      { label: tFooter('howToFormFloridaCorp'), href: href('/guides/how-to-form-a-florida-corporation') },
      { label: tFooter('floridaAnnualReportGuide'), href: href('/guides/florida-annual-report') },
      { label: tFooter('floridaRegisteredAgentGuide'), href: href('/guides/florida-registered-agent') },
      { label: tFooter('floridaLLCGuide'), href: href('/guides/florida-llc-operating-agreement') },
      { label: tFooter('boiGuide'), href: href('/boi-reporting') },
      { label: tFooter('annualReportHelp'), href: href('/file-annual-report') },
    ],
  };

  return (
    <footer className="mt-20 bg-[#0D1B2A] text-white">
      <div className="container py-16">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-8 lg:gap-16">
          <div className="col-span-2 md:col-span-1 space-y-4">
            <Logo variant="dark" href={href('/')} />
            <p className="text-sm text-white/60 leading-relaxed max-w-xs">{tFooter('tagline')}</p>
            <div className="flex items-center gap-2 text-xs text-white/40">
              <span className="inline-block h-2 w-2 rounded-full bg-accent animate-pulse-soft" />
              <span>{tFooter('systemsOperational')}</span>
            </div>
          </div>

          <FooterColumn title={tFooter('product')} links={FOOTER_LINKS.product} />
          <FooterColumn title={tFooter('company')} links={FOOTER_LINKS.company} />
          <FooterColumn title={tFooter('legal')} links={FOOTER_LINKS.legal} />
          <FooterColumn title={tFooter('resources')} links={FOOTER_LINKS.resources} />
        </div>

        <div className="mt-16 pt-8 border-t border-white/10 flex flex-col-reverse md:flex-row md:items-center md:justify-between gap-4">
          <p className="text-xs text-white/30">
            {tFooter('copyright', {
              year: COPYRIGHT_YEAR,
              company: BUSINESS_LEGAL_NAME,
              address: BUSINESS_ADDRESS,
            })}
          </p>
          <div className="flex items-center gap-3 text-xs">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-accent/20 text-accent">
              <svg className="h-3 w-3" viewBox="0 0 16 16" fill="currentColor">
                <path d="M8 0L9.79 6.21H16L11.1 9.79L13 16L8 12L3 16L4.9 9.79L0 6.21H6.21L8 0Z" />
              </svg>
              AES-256 Encrypted
            </span>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/20 text-primary-200">
              SSL Secured
            </span>
          </div>
        </div>

        <p className="mt-6 max-w-3xl text-[11px] leading-relaxed text-white/30">
          {tDisc('notAffiliated')}
        </p>
      </div>
    </footer>
  );
}

function FooterColumn({ title, links }: { title: string; links: { label: string; href: string }[] }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wider text-white/40 mb-4">{title}</p>
      <ul className="space-y-2.5">
        {links.map((link) => (
          <li key={link.href}>
            <Link
              href={link.href}
              className="text-sm text-white/60 hover:text-white transition-colors"
            >
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
