-- Click IDs captured alongside UTMs, plus stored business-services requests.

ALTER TABLE "User" ADD COLUMN "gclid" TEXT;
ALTER TABLE "User" ADD COLUMN "liFatId" TEXT;

ALTER TABLE "Filing" ADD COLUMN "gclid" TEXT;
ALTER TABLE "Filing" ADD COLUMN "liFatId" TEXT;

CREATE TABLE "ServiceInquiry" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "service" TEXT NOT NULL,
    "message" TEXT,
    "locale" TEXT NOT NULL DEFAULT 'en',
    "utmSource" TEXT,
    "utmMedium" TEXT,
    "utmCampaign" TEXT,
    "utmContent" TEXT,
    "utmTerm" TEXT,
    "gclid" TEXT,
    "liFatId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServiceInquiry_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ServiceInquiry_email_createdAt_idx" ON "ServiceInquiry"("email", "createdAt");
CREATE INDEX "ServiceInquiry_service_createdAt_idx" ON "ServiceInquiry"("service", "createdAt");
