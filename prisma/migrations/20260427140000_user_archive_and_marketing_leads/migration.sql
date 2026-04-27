-- Customer-facing draft archival.
-- Customers can hide a DRAFT filing from their dashboard without us deleting
-- the underlying data, so admins can still measure where users dropped off
-- and reach out for retention. NULL = visible on dashboard.
ALTER TABLE "Filing" ADD COLUMN "userArchivedAt" TIMESTAMP(3);

-- Marketing lead capture for `coming_soon` (non-Florida) states. Defined in
-- lib/marketing-states.ts; surfaced via components/marketing/StateWaitlistForm.
-- We dedupe per (email, state) so a visitor pinging multiple times only
-- creates one row per state of interest.
CREATE TABLE "MarketingLead" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "locale" TEXT NOT NULL DEFAULT 'en',
    "source" TEXT,
    "campaign" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketingLead_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MarketingLead_state_createdAt_idx" ON "MarketingLead"("state", "createdAt");
CREATE UNIQUE INDEX "MarketingLead_email_state_key" ON "MarketingLead"("email", "state");
