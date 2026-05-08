-- Customer communication log + file URL hooks
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "mockupUrl" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "artFileUrl" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "proofFileUrl" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "pickupNotifiedAt" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "CustomerCommunication" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "customerName" TEXT,
    "customerEmail" TEXT,
    "type" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerCommunication_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "CustomerCommunication_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "CustomerCommunication_orderId_idx" ON "CustomerCommunication"("orderId");
CREATE INDEX IF NOT EXISTS "CustomerCommunication_createdAt_idx" ON "CustomerCommunication"("createdAt");
CREATE INDEX IF NOT EXISTS "CustomerCommunication_type_idx" ON "CustomerCommunication"("type");
