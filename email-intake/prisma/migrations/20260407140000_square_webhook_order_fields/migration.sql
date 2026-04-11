-- AlterTable
ALTER TABLE "Order" ADD COLUMN "amountPaid" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "Order" ADD COLUMN "depositPaidAt" TIMESTAMP(3);
ALTER TABLE "Order" ADD COLUMN "finalPaidAt" TIMESTAMP(3);
ALTER TABLE "Order" ADD COLUMN "squareLastEventId" TEXT;
ALTER TABLE "Order" ADD COLUMN "squareInvoiceStatus" TEXT;
ALTER TABLE "Order" ADD COLUMN "squarePaymentStatus" TEXT;

-- CreateTable
CREATE TABLE "ProcessedWebhookEvent" (
    "id" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProcessedWebhookEvent_pkey" PRIMARY KEY ("id")
);
