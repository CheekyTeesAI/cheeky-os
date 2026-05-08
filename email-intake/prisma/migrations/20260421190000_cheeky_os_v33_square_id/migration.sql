-- Cheeky OS v3.3 — squareId for import dedupe
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "squareId" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "Order_squareId_key" ON "Order"("squareId");

CREATE INDEX IF NOT EXISTS "Order_squareId_idx" ON "Order"("squareId");
