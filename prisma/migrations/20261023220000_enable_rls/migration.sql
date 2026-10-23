-- Enable row level security on every public table.
-- Idempotent: ENABLE ROW LEVEL SECURITY is a no-op when RLS is already on.
-- Do not FORCE row level security. The table owner (the Prisma role) keeps
-- access; Supabase API roles are revoked below when they exist.
-- Safe to re-run. Production already has these statements applied. To record
-- that in Prisma history without executing this file:
--   prisma migrate resolve --applied 20261023220000_enable_rls

ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Filing" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FilingStep" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ManagerMember" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Payment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Document" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "State" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PricingTier" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AdditionalService" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FilingAdditionalService" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RegisteredAgentService" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "EmailNotification" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AnnualReport" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AdminAction" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AnalyticsEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "EinApplication" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MarketingLead" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ServiceInquiry" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PasswordResetToken" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "LoginLinkToken" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Coupon" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FaxMessage" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AssistantConversation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AssistantMessage" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "_prisma_migrations" ENABLE ROW LEVEL SECURITY;

-- EmailSuppression is created by 20261023120000_email_suppression_and_test_drafts,
-- which is already applied in production and may be absent from a checkout that
-- does not contain that migration. Enable RLS only when the table is present.
DO $$
BEGIN
  IF to_regclass('public."EmailSuppression"') IS NOT NULL THEN
    ALTER TABLE "EmailSuppression" ENABLE ROW LEVEL SECURITY;
  END IF;
END
$$;

-- Any other public table (drift, implicit join tables) gets RLS too.
-- ENABLE is idempotent; this does not FORCE row level security.
DO $$
DECLARE
  tbl text;
BEGIN
  FOR tbl IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND NOT c.relrowsecurity
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tbl);
  END LOOP;
END
$$;

-- anon/authenticated exist on Supabase and are absent on plain Postgres.
-- Skip the revokes unless both roles exist so this migration still applies
-- locally and in CI.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
     AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
    REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;
  END IF;
END
$$;
