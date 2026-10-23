-- Suppression list for bounced recipients, plus a test flag so recovery
-- skips internal drafts. Admin DRAFT filings are flagged in place — not deleted.

ALTER TABLE "Filing" ADD COLUMN "isTest" BOOLEAN NOT NULL DEFAULT false;

UPDATE "Filing" AS f
SET "isTest" = true
FROM "User" AS u
WHERE f."userId" = u.id
  AND f.status = 'DRAFT'
  AND (
    u.role = 'ADMIN'
    OR lower(u.email) = 'laura@launchforma.com'
    OR lower(u.email) LIKE '%@launchforma.com'
  );

CREATE TABLE "EmailSuppression" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "reason" TEXT NOT NULL DEFAULT 'BOUNCE',
    "detail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailSuppression_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EmailSuppression_email_key" ON "EmailSuppression"("email");

CREATE INDEX "EmailNotification_recipientEmail_idx" ON "EmailNotification"("recipientEmail");
