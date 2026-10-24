-- Locale for resume emails, checklist opt-in consent, and marketing unsubscribe.
-- Step sends are tracked on EmailNotification (RESUME_1H / RESUME_1D / RESUME_3D),
-- so this migration does not add per-step columns.

ALTER TABLE "User" ADD COLUMN "locale" TEXT;
ALTER TABLE "Filing" ADD COLUMN "locale" TEXT;

CREATE TABLE "ChecklistSignup" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "locale" TEXT NOT NULL DEFAULT 'es',
    "consent" BOOLEAN NOT NULL,
    "consentAt" TIMESTAMP(3) NOT NULL,
    "consentText" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChecklistSignup_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ChecklistSignup_email_key" ON "ChecklistSignup"("email");
CREATE INDEX "ChecklistSignup_createdAt_idx" ON "ChecklistSignup"("createdAt");

CREATE TABLE "MarketingOptOut" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'unsubscribe',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketingOptOut_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MarketingOptOut_email_key" ON "MarketingOptOut"("email");

ALTER TABLE "ChecklistSignup" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MarketingOptOut" ENABLE ROW LEVEL SECURITY;
