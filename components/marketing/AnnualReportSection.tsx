'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowRight, CheckCircle2, X, AlertTriangle, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatCurrency } from '@/lib/utils';
import { FL } from '@/lib/florida';
import { ANNUAL_REPORT_SERVICE_FEE_CENTS } from '@/lib/pricing';

const LLC_STATE_FEE = FL.fees.annualReportLLC;   // $138.75
const CORP_STATE_FEE = FL.fees.annualReportCorp; // $150.00
const OUR_FEE = ANNUAL_REPORT_SERVICE_FEE_CENTS; // $80

const competitors = [
  { name: 'LegalZoom',         fee: 9_900,  icon: 'x' },
  { name: 'FilingServices.com', fee: 14_900, icon: 'x' },
  { name: 'IncServices',        fee: OUR_FEE, icon: 'check', us: true },
];

export function AnnualReportSection() {
  return (
    <section className="py-20 md:py-28 bg-gradient-to-b from-white to-primary/5">
      <div className="container max-w-6xl">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center space-y-4 mb-12"
        >
          {/* Urgency banner */}
          <div className="inline-flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-800 text-xs font-semibold px-4 py-2 rounded-full">
            <AlertTriangle className="h-3.5 w-3.5" />
            Florida deadline: May 1 — $400 non-waivable late penalty after that
          </div>

          <h2 className="font-display text-4xl md:text-5xl font-medium tracking-tight">
            Already have a Florida company?<br className="hidden md:block" />
            <span className="gradient-text italic"> File your annual report with us.</span>
          </h2>
          <p className="text-lg text-ink-muted max-w-2xl mx-auto">
            No account needed. Enter your document number, review your info, and we file with
            the Florida Division of Corporations on the same day.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-start">
          {/* Left — comparison + CTA */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="space-y-6"
          >
            {/* Price comparison table */}
            <div className="rounded-2xl overflow-hidden border border-border shadow-card bg-white">
              <div className="bg-muted/40 px-5 py-3 text-xs font-semibold uppercase tracking-widest text-ink-subtle">
                Service fee comparison (+ Florida state fee)
              </div>
              <table className="w-full text-sm">
                <tbody className="divide-y divide-border">
                  {competitors.map((c) => (
                    <tr key={c.name} className={c.us ? 'bg-primary/5' : 'bg-white'}>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2">
                          {c.us
                            ? <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                            : <X className="h-4 w-4 text-red-400 shrink-0" />}
                          <span className={c.us ? 'font-semibold text-primary' : 'text-ink-muted'}>
                            {c.name}
                          </span>
                          {c.us && (
                            <span className="ml-1 text-[10px] font-bold bg-primary text-white px-2 py-0.5 rounded-full">
                              BEST PRICE
                            </span>
                          )}
                        </div>
                      </td>
                      <td className={`px-5 py-3.5 text-right tabular-nums font-medium ${c.us ? 'text-primary' : 'text-ink-muted'}`}>
                        {formatCurrency(c.fee)} + state fee
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-muted/30">
                    <td colSpan={2} className="px-5 py-2.5 text-xs text-ink-subtle">
                      State fee: {formatCurrency(LLC_STATE_FEE)} (LLC) · {formatCurrency(CORP_STATE_FEE)} (Corp)
                      &nbsp;·&nbsp; Totals: {formatCurrency(OUR_FEE + LLC_STATE_FEE)} LLC /
                      {' '}{formatCurrency(OUR_FEE + CORP_STATE_FEE)} Corp all-in with IncServices
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            <Button asChild size="lg" className="w-full group text-base">
              <Link href="/file-annual-report">
                File my annual report now
                <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
              </Link>
            </Button>
            <p className="text-center text-xs text-ink-subtle">
              No account required · Same-day filing · Secure checkout
            </p>
          </motion.div>

          {/* Right — what's included cards */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="space-y-4"
          >
            {[
              {
                icon: <Calendar className="h-5 w-5 text-primary" />,
                title: 'Avoid the $400 late penalty',
                body: 'Florida imposes a $400 non-waivable penalty on annual reports filed after May 1. We make sure yours lands on time.',
              },
              {
                icon: <CheckCircle2 className="h-5 w-5 text-primary" />,
                title: 'Pre-filled from state records',
                body: 'We pull your current company data directly from Sunbiz so you only review and confirm — no manual data entry.',
              },
              {
                icon: <CheckCircle2 className="h-5 w-5 text-primary" />,
                title: 'Officers & addresses you control',
                body: 'Update any officer, address, or registered agent on the same form before we file — changes go live on Sunbiz.',
              },
              {
                icon: <CheckCircle2 className="h-5 w-5 text-primary" />,
                title: 'Optional registered agent upgrade',
                body: 'Already filing? Add our Registered Agent service for just $150/yr and keep your personal address off the public record.',
              },
            ].map((item) => (
              <div key={item.title} className="flex gap-4 p-4 rounded-xl border border-border bg-white">
                <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  {item.icon}
                </div>
                <div>
                  <p className="font-semibold text-sm text-ink">{item.title}</p>
                  <p className="text-sm text-ink-muted mt-0.5 leading-snug">{item.body}</p>
                </div>
              </div>
            ))}
          </motion.div>
        </div>
      </div>
    </section>
  );
}
