import 'server-only';
import { prisma } from '@/lib/db';
import {
  normalizeFloridaDocumentKey,
  type SunbizArCandidateFacts,
} from '@/lib/guest-annual-report-offer';

/**
 * Candidate row for a document number.
 * A missing table or a failed read is treated as no row, so checkout stays closed.
 * sourceFileDate is not returned. It is not shown to customers.
 */
export async function findSunbizArCandidate(
  documentNumber: string,
): Promise<SunbizArCandidateFacts | null> {
  const key = normalizeFloridaDocumentKey(documentNumber);
  if (!key) return null;
  try {
    const row = await prisma.sunbizArCandidate.findUnique({
      where: { documentNumber: key },
      select: { status: true, entityType: true, formationDate: true, arYears: true },
    });
    if (!row) return null;
    return {
      status: row.status,
      entityType: row.entityType,
      formationDate: row.formationDate,
      arYears: row.arYears,
    };
  } catch {
    return null;
  }
}
