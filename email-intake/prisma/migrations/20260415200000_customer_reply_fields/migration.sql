-- Inbound customer reply metadata; allow unmatched rows (orderId optional)
ALTER TABLE "CustomerCommunication" ADD COLUMN IF NOT EXISTS "classification" TEXT;
ALTER TABLE "CustomerCommunication" ADD COLUMN IF NOT EXISTS "needsReview" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "CustomerCommunication" ADD COLUMN IF NOT EXISTS "matchConfidence" TEXT;

ALTER TABLE "CustomerCommunication" ALTER COLUMN "orderId" DROP NOT NULL;

CREATE INDEX IF NOT EXISTS "CustomerCommunication_needsReview_idx" ON "CustomerCommunication"("needsReview");
