-- Cheeky OS v3.2 — OrderStatus enum + decision fields + ArtFile + Estimate

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'OrderStatus') THEN
    ALTER TYPE "OrderStatus" ADD VALUE 'WAITING_GARMENTS';
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'OrderStatus') THEN
    ALTER TYPE "OrderStatus" ADD VALUE 'WAITING_ART';
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'OrderStatus') THEN
    ALTER TYPE "OrderStatus" ADD VALUE 'UNKNOWN';
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE "ArtFile" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "label" TEXT NOT NULL DEFAULT '',
    "url" TEXT,
    "approvalStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ArtFile_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ArtFile_orderId_idx" ON "ArtFile"("orderId");

ALTER TABLE "ArtFile" ADD CONSTRAINT "ArtFile_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "Estimate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "qty" INTEGER NOT NULL DEFAULT 0,
    "description" TEXT NOT NULL,
    "htmlBody" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "orderId" TEXT,
    CONSTRAINT "Estimate_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Estimate_orderId_key" ON "Estimate"("orderId");

CREATE INDEX "Estimate_status_idx" ON "Estimate"("status");

ALTER TABLE "Estimate" ADD CONSTRAINT "Estimate_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Order" ADD COLUMN "nextAction" TEXT;
ALTER TABLE "Order" ADD COLUMN "nextOwner" TEXT;
ALTER TABLE "Order" ADD COLUMN "garmentsOrdered" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Order" ADD COLUMN "garmentsReceived" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Order" ADD COLUMN "productionComplete" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Order" ADD COLUMN "qcComplete" BOOLEAN NOT NULL DEFAULT false;
