import { FL } from '@/lib/florida';
import { formatCurrency } from '@/lib/utils';

/** State fee figures already used by the Florida LLC cost guide and FL constants. */
export function floridaLlcGuideFees() {
  return {
    filing: formatCurrency(FL.fees.llcArticles),
    agent: formatCurrency(FL.fees.llcRegisteredAgent),
    total: formatCurrency(FL.fees.llcTotal),
    annual: formatCurrency(FL.fees.annualReportLLC),
    late: formatCurrency(FL.fees.annualReportLLC + FL.fees.annualReportLateFee),
    processingDates: FL.urls.documentProcessingDates,
  };
}
