-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "garmentVendor" TEXT,
ADD COLUMN     "garmentOrderStatus" TEXT,
ADD COLUMN     "garmentOrderPlacedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "VendorOrder" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "orderId" TEXT NOT NULL,
    "vendorName" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "externalOrderId" TEXT,
    "payloadJson" TEXT,
    "responseJson" TEXT,
    "simulated" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "VendorOrder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VendorOrder_orderId_idx" ON "VendorOrder"("orderId");

-- CreateIndex
CREATE INDEX "VendorOrder_vendorName_idx" ON "VendorOrder"("vendorName");

-- CreateIndex
CREATE INDEX "VendorOrder_status_idx" ON "VendorOrder"("status");

-- AddForeignKey
ALTER TABLE "VendorOrder" ADD CONSTRAINT "VendorOrder_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
