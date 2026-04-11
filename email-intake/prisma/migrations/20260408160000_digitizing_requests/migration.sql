-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "digitizingRequired" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "digitizingStatus" TEXT,
ADD COLUMN     "digitizingRequestedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "DigitizingRequest" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "orderId" TEXT NOT NULL,
    "jobId" TEXT,
    "status" TEXT NOT NULL,
    "vendorName" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "recipientEmail" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3),
    "simulated" BOOLEAN NOT NULL DEFAULT true,
    "errorMessage" TEXT,

    CONSTRAINT "DigitizingRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DigitizingRequest_orderId_idx" ON "DigitizingRequest"("orderId");

-- CreateIndex
CREATE INDEX "DigitizingRequest_jobId_idx" ON "DigitizingRequest"("jobId");

-- CreateIndex
CREATE INDEX "DigitizingRequest_status_idx" ON "DigitizingRequest"("status");

-- AddForeignKey
ALTER TABLE "DigitizingRequest" ADD CONSTRAINT "DigitizingRequest_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DigitizingRequest" ADD CONSTRAINT "DigitizingRequest_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE SET NULL ON UPDATE CASCADE;
