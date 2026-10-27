-- Candidates for a late Florida annual report, loaded from the free
-- Sunbiz corporate data file. Additive. No changes to existing tables.
-- Holds only companies that are active, formed before the target year,
-- and whose record does not list that year. Primary key only.

CREATE TABLE "SunbizArCandidate" (
    "documentNumber" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "formationDate" DATE NOT NULL,
    "arYears" INTEGER[] NOT NULL,
    "sourceFileDate" DATE NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SunbizArCandidate_pkey" PRIMARY KEY ("documentNumber")
);

ALTER TABLE "SunbizArCandidate" ENABLE ROW LEVEL SECURITY;

-- No policies. The app role keeps access. Skip when Supabase roles are absent.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
     AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE public."SunbizArCandidate" FROM anon, authenticated;
  END IF;
END
$$;
