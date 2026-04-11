-- CreateTable
CREATE TABLE "ProductionRoute" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "orderId" TEXT NOT NULL,
    "productionTypeFinal" TEXT NOT NULL,
    "assignedProductionTo" TEXT NOT NULL,
    "routingRule" TEXT,

    CONSTRAINT "ProductionRoute_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProductionRoute_orderId_key" ON "ProductionRoute"("orderId");

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "routingStatus" TEXT,
ADD COLUMN     "productionTypeFinal" TEXT,
ADD COLUMN     "assignedProductionTo" TEXT;

-- AddForeignKey
ALTER TABLE "ProductionRoute" ADD CONSTRAINT "ProductionRoute_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
