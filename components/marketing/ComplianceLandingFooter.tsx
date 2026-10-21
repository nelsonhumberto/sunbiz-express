import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { BUSINESS_ADDRESS, BUSINESS_LEGAL_NAME } from '@/lib/constants';

export async function ComplianceLandingFooter() {
  const tDisc = await getTranslations('disclosure');
  const tFooter = await getTranslations('footer');

  return (
    <footer className="bg-[#0D1B2A] text-white">
      <div className="container py-10 flex flex-col gap-4">
        <p className="text-sm text-white/80">
          {BUSINESS_LEGAL_NAME}
          <span className="text-white/40"> · </span>
          {BUSINESS_ADDRESS}
        </p>
        <nav className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
          <Link className="text-white/70 hover:text-white" href="/terms">{tFooter('terms')}</Link>
          <Link className="text-white/70 hover:text-white" href="/privacy">{tFooter('privacy')}</Link>
          <Link className="text-white/70 hover:text-white" href="/refund-policy">{tFooter('refundPolicy')}</Link>
          <Link className="text-white/70 hover:text-white" href="/disclaimer">{tFooter('disclaimer')}</Link>
        </nav>
        <p className="max-w-3xl text-sm leading-relaxed text-white/70">{tDisc('notAffiliatedServices')}</p>
      </div>
    </footer>
  );
}
