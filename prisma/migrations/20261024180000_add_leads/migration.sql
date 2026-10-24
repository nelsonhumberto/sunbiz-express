-- Double opt-in leads for the Florida LLC operating agreement samples.
-- Private to the server role: RLS on, no policies, anon/authenticated revoked.
-- Checks that Prisma does not model live here: consent must be true, locale is en or es.

CREATE EXTENSION IF NOT EXISTS citext;

CREATE TABLE "leads" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" CITEXT NOT NULL,
    "consent" BOOLEAN NOT NULL,
    "consent_text" TEXT NOT NULL,
    "consent_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "locale" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "confirm_token_hash" TEXT,
    "confirm_token_expires_at" TIMESTAMPTZ(6),
    "confirmed_at" TIMESTAMPTZ(6),
    "newsletter_synced_at" TIMESTAMPTZ(6),
    "unsubscribed_at" TIMESTAMPTZ(6),
    "ip_hash" TEXT,
    "user_agent" TEXT,
    "utm_source" TEXT,
    "utm_medium" TEXT,
    "utm_campaign" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "leads_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "leads_consent_check" CHECK ("consent"),
    CONSTRAINT "leads_locale_check" CHECK ("locale" IN ('en', 'es'))
);

CREATE UNIQUE INDEX "leads_email_source_key" ON "leads"("email", "source");
CREATE UNIQUE INDEX "leads_confirm_token_hash_key" ON "leads"("confirm_token_hash");

ALTER TABLE "leads" ENABLE ROW LEVEL SECURITY;

-- No policies: anon and authenticated have no select or update.
-- Skip when those roles are absent (local Postgres / CI).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
     AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE public.leads FROM anon, authenticated;
  END IF;
END
$$;
