import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Download, FileText, Folder, Clock } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatDate } from '@/lib/utils';
import {
  filingHasOperatingAgreement,
  type AddOnSlug,
  type TierSlug,
} from '@/lib/pricing';

export const dynamic = 'force-dynamic';

export default async function DocumentsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/sign-in');
  const tDash = await getTranslations('dashboard');
  const tWizard = await getTranslations('wizard');
  const tDetail = await getTranslations('filingDetail');
  const tDocs = await getTranslations('documentTypes');

  const TYPE_LABEL: Record<string, string> = {
    ARTICLES_ORG: tDocs('ARTICLES_ORG'),
    ARTICLES_INC: tDocs('ARTICLES_INC'),
    OPERATING_AGREEMENT: tDocs('OPERATING_AGREEMENT'),
    EIN_LETTER: tDocs('EIN_LETTER'),
    CERT_STATUS: tDocs('CERT_STATUS'),
    CERT_COPY: tDocs('CERT_COPY'),
    RECEIPT: tDocs('RECEIPT'),
  };

  const filings = await prisma.filing.findMany({
    where: { userId: session.user.id, documents: { some: {} } },
    include: {
      documents: { orderBy: { generatedAt: 'desc' } },
      managersMembers: true,
      filingAdditionalServices: { include: { service: true } },
    },
    orderBy: { updatedAt: 'desc' },
  });

  // Hide Operating Agreements for filings that did not pay for one.
  // (Legacy filings created before the entitlement check existed may still
  // have an OPERATING_AGREEMENT row; this filter gates them from view.)
  // Always hide the COVER_LETTER — it's an admin-only document used to
  // accompany the Articles to the state.
  const visibleFilings = filings.map((filing) => {
    const addOnSlugs = filing.filingAdditionalServices.map(
      (fas) => fas.service.serviceSlug as AddOnSlug,
    );
    const oaEntitled =
      filing.entityType === 'LLC' &&
      filingHasOperatingAgreement({
        tier: filing.serviceTier as TierSlug,
        addOnSlugs,
        memberCount: filing.managersMembers.length,
      });
    const documents = filing.documents.filter((d) => {
      if (d.documentType === 'COVER_LETTER') return false;
      if (d.documentType === 'OPERATING_AGREEMENT' && !oaEntitled) return false;
      return true;
    });
    return { ...filing, documents };
  }).filter((f) => f.documents.length > 0);

  return (
    <div className="container max-w-4xl py-10 space-y-8">
      <div>
        <h1 className="font-display text-4xl font-medium tracking-tight">{tDash('documentsTitle')}</h1>
        <p className="mt-2 text-ink-muted">{tDash('documentsSubtitle')}</p>
      </div>

      {visibleFilings.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-border bg-white p-10 text-center">
          <Folder className="h-10 w-10 mx-auto text-ink-subtle mb-3" />
          <p className="text-ink-muted">{tDash('documentsEmpty')}</p>
        </div>
      ) : (
        <div className="space-y-6">
          {visibleFilings.map((filing) => (
            <Card key={filing.id}>
              <CardContent className="p-0">
                <div className="border-b border-border px-6 py-4 flex items-baseline justify-between flex-wrap gap-2">
                  <div>
                    <Link
                      href={`/dashboard/filings/${filing.id}`}
                      className="font-semibold text-ink hover:text-primary transition-colors"
                    >
                      {filing.businessName}
                    </Link>
                    <p className="text-xs text-ink-subtle">
                      {filing.entityType === 'LLC' ? tDocs('floridaLLCFull') : tDocs('floridaCorpFull')}
                    </p>
                  </div>
                  <Badge variant="secondary">
                    {filing.documents.length} {tDash('files')}
                  </Badge>
                </div>
                <ul className="divide-y divide-border">
                  {filing.documents.map((doc) =>
                    doc.pendingState ? (
                      <li key={doc.id}>
                        <div className="flex items-center gap-4 px-6 py-3.5 cursor-not-allowed bg-muted/20">
                          <div className="h-10 w-10 rounded-md bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                            <Clock className="h-5 w-5" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{doc.title}</p>
                            <p className="text-xs text-ink-muted">
                              {TYPE_LABEL[doc.documentType] ?? doc.documentType} ·{' '}
                              {tWizard('documentPendingState')}
                            </p>
                          </div>
                          <Badge variant="outline" className="border-amber-300 text-amber-700">
                            {tDetail('filingPending')}
                          </Badge>
                        </div>
                      </li>
                    ) : (
                      <li key={doc.id}>
                        <Link
                          href={`/api/documents/${doc.id}`}
                          target="_blank"
                          className="flex items-center gap-4 px-6 py-3.5 hover:bg-muted/30 transition-colors"
                        >
                          <div className="h-10 w-10 rounded-md bg-primary/10 text-primary flex items-center justify-center shrink-0">
                            <FileText className="h-5 w-5" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{doc.title}</p>
                            <p className="text-xs text-ink-muted">
                              {TYPE_LABEL[doc.documentType] ?? doc.documentType} · {formatDate(doc.generatedAt)}
                            </p>
                          </div>
                          <Download className="h-4 w-4 text-ink-subtle" />
                        </Link>
                      </li>
                    ),
                  )}
                </ul>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
