-- Garment ordering + work-order / art placeholders (operational tracking)
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "garmentOrderReceivedAt" TIMESTAMP(3);
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "garmentOrderNeeded" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "workOrderStatus" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "artFileStatus" TEXT;
