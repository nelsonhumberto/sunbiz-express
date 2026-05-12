-- EIN responsible-party data captured for the IRS Form SS-4. Sensitive
-- columns (taxIdEncrypted, dobEncrypted, passportEncrypted, einNumberEncrypted)
-- are populated via lib/encryption.ts (AES-256-GCM). The *Last4 columns are
-- the only PII allowed in plaintext for admin/customer UI display.
CREATE TABLE "EinApplication" (
    "id" TEXT NOT NULL,
    "filingId" TEXT NOT NULL,

    "responsiblePartyType" TEXT NOT NULL DEFAULT 'us',
    "legalName" TEXT,
    "title" TEXT,
    "phone" TEXT,
    "email" TEXT,

    "taxIdType" TEXT,
    "taxIdEncrypted" TEXT,
    "taxIdLast4" TEXT,
    "dobEncrypted" TEXT,

    "countryOfCitizenship" TEXT,
    "passportCountry" TEXT,
    "passportEncrypted" TEXT,
    "passportLast4" TEXT,
    "identityVerificationConsent" BOOLEAN NOT NULL DEFAULT false,

    "consentToFile" BOOLEAN NOT NULL DEFAULT false,
    "consentToShare" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'needs_info',
    "staffNotes" TEXT,

    "submittedAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "einNumberLast4" TEXT,
    "einNumberEncrypted" TEXT,

    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EinApplication_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EinApplication_filingId_key" ON "EinApplication"("filingId");
CREATE INDEX "EinApplication_status_idx" ON "EinApplication"("status");

ALTER TABLE "EinApplication" ADD CONSTRAINT "EinApplication_filingId_fkey"
    FOREIGN KEY ("filingId") REFERENCES "Filing"("id") ON DELETE CASCADE ON UPDATE CASCADE;
