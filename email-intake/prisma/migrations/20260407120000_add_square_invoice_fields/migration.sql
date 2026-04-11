-- AlterTable
ALTER TABLE "Order" ADD COLUMN "squareCustomerId" TEXT;
ALTER TABLE "Order" ADD COLUMN "squareOrderId" TEXT;
ALTER TABLE "Order" ADD COLUMN "squareInvoiceNumber" TEXT;
ALTER TABLE "Order" ADD COLUMN "depositPercent" DOUBLE PRECISION;
ALTER TABLE "Order" ADD COLUMN "invoiceExpiresAt" TIMESTAMP(3);
