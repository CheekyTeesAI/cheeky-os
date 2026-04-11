-- AlterTable
ALTER TABLE "Order" ADD COLUMN "outlookMessageId" TEXT;

-- CreateIndex
CREATE INDEX "Order_outlookMessageId_idx" ON "Order"("outlookMessageId");
