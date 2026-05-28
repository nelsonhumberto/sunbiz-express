-- Add first-touch (User) and last-touch (Filing) UTM attribution columns for
-- paid campaign reporting.

ALTER TABLE "User" ADD COLUMN "utmSource" TEXT;
ALTER TABLE "User" ADD COLUMN "utmMedium" TEXT;
ALTER TABLE "User" ADD COLUMN "utmCampaign" TEXT;
ALTER TABLE "User" ADD COLUMN "utmContent" TEXT;
ALTER TABLE "User" ADD COLUMN "utmTerm" TEXT;

ALTER TABLE "Filing" ADD COLUMN "utmSource" TEXT;
ALTER TABLE "Filing" ADD COLUMN "utmMedium" TEXT;
ALTER TABLE "Filing" ADD COLUMN "utmCampaign" TEXT;
ALTER TABLE "Filing" ADD COLUMN "utmContent" TEXT;
ALTER TABLE "Filing" ADD COLUMN "utmTerm" TEXT;
