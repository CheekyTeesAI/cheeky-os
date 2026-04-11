-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "squareInvoiceSentAt" TIMESTAMP(3),
ADD COLUMN     "quoteExpiresAt" TIMESTAMP(3),
ADD COLUMN     "squareInvoicePublished" BOOLEAN NOT NULL DEFAULT false;
