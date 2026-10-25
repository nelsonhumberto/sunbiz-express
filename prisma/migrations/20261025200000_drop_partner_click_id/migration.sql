-- Drop the unused partner click id. Google gclid stays.

ALTER TABLE "User" DROP COLUMN "liFatId";
ALTER TABLE "Filing" DROP COLUMN "liFatId";
ALTER TABLE "ServiceInquiry" DROP COLUMN "liFatId";
