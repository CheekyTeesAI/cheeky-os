-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "OrderDepositStatus" AS ENUM ('NONE', 'PARTIAL', 'PAID');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- AlterEnum (ignore if re-run)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'OrderStatus') THEN
    ALTER TYPE "OrderStatus" ADD VALUE 'AWAITING_DEPOSIT';
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "depositPaid" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "depositStatus" "OrderDepositStatus" NOT NULL DEFAULT 'NONE';

-- Backfill from legacy flags
UPDATE "Order"
SET
  "depositPaid" = COALESCE("amountPaid", 0),
  "depositStatus" = 'PAID'
WHERE "depositReceived" = true;

UPDATE "Order"
SET
  "depositPaid" = COALESCE("amountPaid", 0),
  "depositStatus" = 'PARTIAL'
WHERE
  "depositReceived" = false
  AND COALESCE("amountPaid", 0) > 0
  AND "depositStatus" = 'NONE';
