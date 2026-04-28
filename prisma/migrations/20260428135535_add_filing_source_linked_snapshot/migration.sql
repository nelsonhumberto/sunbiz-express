-- AlterTable
ALTER TABLE "Filing" ADD COLUMN     "filingSource" TEXT NOT NULL DEFAULT 'WIZARD',
ADD COLUMN     "linkedEntitySnapshot" TEXT;
