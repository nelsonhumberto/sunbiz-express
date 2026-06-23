-- Federal tax election chosen at formation (null = default treatment,
-- 'S_CORP' = elect S-Corporation taxation via IRS Form 2553). Applies to
-- both LLC and CORP entity types.
ALTER TABLE "Filing" ADD COLUMN "taxElection" TEXT;
