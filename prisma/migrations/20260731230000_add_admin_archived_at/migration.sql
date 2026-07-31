-- Admin archive / exclude-from-analytics flag on filings.
-- NULL = active (counts in analytics); non-null = archived/test (ignored).
ALTER TABLE "Filing" ADD COLUMN "adminArchivedAt" TIMESTAMP(3);
