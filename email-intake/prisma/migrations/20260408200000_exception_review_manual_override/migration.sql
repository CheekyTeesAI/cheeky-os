-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "manualOverride" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "manualOverrideReason" TEXT,
ADD COLUMN     "manualOverrideBy" TEXT,
ADD COLUMN     "manualOverrideAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "ExceptionReview" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "orderId" TEXT,
    "jobId" TEXT,
    "type" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "detailsJson" TEXT,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "resolvedAt" TIMESTAMP(3),
    "resolvedBy" TEXT,

    CONSTRAINT "ExceptionReview_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ExceptionReview_orderId_idx" ON "ExceptionReview"("orderId");
CREATE INDEX "ExceptionReview_resolved_idx" ON "ExceptionReview"("resolved");
CREATE INDEX "ExceptionReview_severity_idx" ON "ExceptionReview"("severity");
CREATE INDEX "ExceptionReview_createdAt_idx" ON "ExceptionReview"("createdAt");
