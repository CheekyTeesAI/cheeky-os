-- AlterTable Order
ALTER TABLE "Order" ADD COLUMN "routedAt" TIMESTAMP(3);

-- AlterTable Job
ALTER TABLE "Job" ADD COLUMN "routingNotes" TEXT;

-- AlterTable ProductionRoute — evolve columns
ALTER TABLE "ProductionRoute" ADD COLUMN "jobId" TEXT;
ALTER TABLE "ProductionRoute" ADD COLUMN "routeStatus" TEXT;
ALTER TABLE "ProductionRoute" ADD COLUMN "overridden" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ProductionRoute" ADD COLUMN "overrideReason" TEXT;

ALTER TABLE "ProductionRoute" RENAME COLUMN "productionTypeFinal" TO "productionType";
ALTER TABLE "ProductionRoute" RENAME COLUMN "assignedProductionTo" TO "assignee";
ALTER TABLE "ProductionRoute" RENAME COLUMN "routingRule" TO "rationale";

UPDATE "ProductionRoute" SET "routeStatus" = 'ROUTED' WHERE "routeStatus" IS NULL;
UPDATE "ProductionRoute" SET "rationale" = '' WHERE "rationale" IS NULL;

ALTER TABLE "ProductionRoute" ALTER COLUMN "routeStatus" SET NOT NULL;
ALTER TABLE "ProductionRoute" ALTER COLUMN "rationale" SET NOT NULL;

CREATE INDEX "ProductionRoute_jobId_idx" ON "ProductionRoute"("jobId");

ALTER TABLE "ProductionRoute" ADD CONSTRAINT "ProductionRoute_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE SET NULL ON UPDATE CASCADE;
