-- Work order packet tracking (generation + printable packet)
ALTER TABLE "Order" ADD COLUMN "workOrderNumber" TEXT;
ALTER TABLE "Order" ADD COLUMN "workOrderGeneratedAt" TIMESTAMP(3);
