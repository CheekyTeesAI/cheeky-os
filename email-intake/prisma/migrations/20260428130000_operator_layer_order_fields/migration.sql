-- Additive operator-layer fields (Jeremy). Safe to apply once.
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "operatorAssignedRole" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "operatorProductionPriority" TEXT DEFAULT 'NORMAL';
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "operatorProductionNote" TEXT;
