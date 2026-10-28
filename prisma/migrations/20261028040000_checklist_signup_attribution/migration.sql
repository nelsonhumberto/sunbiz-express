-- Additive nullable columns. No drops, no renames.
-- Stores the landing source and the first-party lf_utm cookie on a checklist opt-in.

ALTER TABLE "ChecklistSignup" ADD COLUMN "source" TEXT;
ALTER TABLE "ChecklistSignup" ADD COLUMN "utmSource" TEXT;
ALTER TABLE "ChecklistSignup" ADD COLUMN "utmMedium" TEXT;
ALTER TABLE "ChecklistSignup" ADD COLUMN "utmCampaign" TEXT;
ALTER TABLE "ChecklistSignup" ADD COLUMN "utmContent" TEXT;
ALTER TABLE "ChecklistSignup" ADD COLUMN "utmTerm" TEXT;
ALTER TABLE "ChecklistSignup" ADD COLUMN "gclid" TEXT;
