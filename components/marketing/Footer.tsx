import Link from 'next/link';
import { Logo } from './Logo';
import { COPYRIGHT_YEAR } from '@/lib/constants';

const FOOTER_LINKS = {
  product: [
    { label: 'Form an LLC', href: '/sign-up?entity=LLC' },
    { label: 'Form a Corporation', href: '/sign-up?entity=CORP' },
    { label: 'Pricing', href: '/pricing' },
    { label: 'Registered Agent', href: '/services#registered-agent' },
    { label: 'Compliance Service', href: '/services#compliance' },
  ],
  company: [
    { label: 'About', href: '/about' },
    { label: 'Why us', href: '/about#why' },
    { label: 'FAQ', href: '/faq' },
    { label: 'Contact', href: '/about#contact' },
  ],
  legal: [
    { label: 'Terms of Service', href: '/terms' },
    { label: 'Privacy Policy', href: '/privacy' },
    { label: 'Disclaimer', href: '/disclaimer' },
    { label: 'Refund Policy', href: '/terms#refunds' },
  ],
  resources: [
    { label: 'Florida LLC Guide', href: '/faq#florida-llc' },
    { label: 'Annual Report Help', href: '/faq#annual-report' },
    { label: 'EIN Lookup', href: '/faq#ein' },
    { label: 'Sunbiz Search', href: 'https://search.sunbiz.org' },
  ],
};

export function Footer() {
  return (
    <footer className="border-t border-border bg-white mt-20">
      <div className="container py-16">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-8 lg:gap-16">
          <div className="col-span-2 md:col-span-1 space-y-4">
            <Logo />
            <p className="text-sm text-ink-muted leading-relaxed max-w-xs">
              The transparent, modern way to form a Florida business. Free Year-1 Registered Agent
              included.
            </p>
            <div className="flex items-center gap-2 text-xs text-ink-subtle">
              <span className="inline-block h-2 w-2 rounded-full bg-success animate-pulse-soft" />
              <span>All systems operational</span>
            </div>
          </div>

          <FooterColumn title="Product" links={FOOTER_LINKS.product} />
          <FooterColumn title="Company" links={FOOTER_LINKS.company} />
          <FooterColumn title="Legal" links={FOOTER_LINKS.legal} />
          <FooterColumn title="Resources" links={FOOTER_LINKS.resources} />
        </div>

        <div className="mt-16 pt-8 border-t border-border flex flex-col-reverse md:flex-row md:items-center md:justify-between gap-4">
          <p className="text-xs text-ink-subtle">
            © {COPYRIGHT_YEAR} Sunbiz Express, Inc. · Sunbiz Express is not a law firm and does
            not provide legal advice.
          </p>
          <div className="flex items-center gap-3 text-xs text-ink-subtle">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-success-subtle text-success">
              <svg className="h-3 w-3" viewBox="0 0 16 16" fill="currentColor">
                <path d="M8 0L9.79 6.21H16L11.1 9.79L13 16L8 12L3 16L4.9 9.79L0 6.21H6.21L8 0Z" />
              </svg>
              SOC 2 Type II
            </span>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/10 text-primary">
              SSL Secured
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}

function FooterColumn({ title, links }: { title: string; links: { label: string; href: string }[] }) {
  return (
    <div>
      <h4 className="text-xs font-semibold uppercase tracking-wider text-ink-subtle mb-4">{title}</h4>
      <ul className="space-y-2.5">
        {links.map((link) => (
          <li key={link.href}>
            <Link
              href={link.href}
              className="text-sm text-ink-muted hover:text-primary transition-colors"
            >
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
