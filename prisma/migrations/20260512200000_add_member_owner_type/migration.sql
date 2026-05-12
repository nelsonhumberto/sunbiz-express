-- Allow members/managers/owners to be either individuals or business entities.
-- ownerType defaults to "individual" so all existing rows are correctly classified.

ALTER TABLE "ManagerMember"
  ADD COLUMN     "ownerType" TEXT NOT NULL DEFAULT 'individual',
  ADD COLUMN     "businessLegalName" TEXT,
  ADD COLUMN     "businessJurisdiction" TEXT,
  ADD COLUMN     "signerName" TEXT;
