import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Download, FileText, Folder } from 'lucide-react';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatDate } from '@/lib/utils';

export const dynamic = 'force-dynamic';

const TYPE_LABEL: Record<string, string> = {
  ARTICLES_ORG: 'Articles of Organization',
  ARTICLES_INC: 'Articles of Incorporation',
  OPERATING_AGREEMENT: 'Operating Agreement',
  EIN_LETTER: 'EIN Letter',
  CERT_STATUS: 'Certificate of Status',
  CERT_COPY: 'Certified Copy',
  RECEIPT: 'Receipt',
};

export default async function DocumentsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/sign-in');

  const filings = await prisma.filing.findMany({
    where: { userId: session.user.id, documents: { some: {} } },
    include: { documents: { orderBy: { generatedAt: 'desc' } } },
    orderBy: { updatedAt: 'desc' },
  });

  return (
    <div className="container max-w-4xl py-10 space-y-8">
      <div>
        <h1 className="font-display text-4xl font-medium tracking-tight">Documents</h1>
        <p className="mt-2 text-ink-muted">
          Download Articles, Operating Agreements, receipts, and other filings.
        </p>
      </div>

      {filings.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-border bg-white p-10 text-center">
          <Folder className="h-10 w-10 mx-auto text-ink-subtle mb-3" />
          <p className="text-ink-muted">
            Documents appear here once a filing is paid and submitted.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {filings.map((filing) => (
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
                      {filing.entityType === 'LLC' ? 'Florida LLC' : 'Florida Corporation'}
                    </p>
                  </div>
                  <Badge variant="secondary">{filing.documents.length} files</Badge>
                </div>
                <ul className="divide-y divide-border">
                  {filing.documents.map((doc) => (
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
                  ))}
                </ul>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
