-- Sales + reactivation opportunities (additive, draft-only workflows)
CREATE TABLE "SalesOpportunity" (
    "id" TEXT NOT NULL,
    "customerId" TEXT,
    "customerName" TEXT NOT NULL,
    "customerEmail" TEXT NOT NULL,
    "customerPhone" TEXT,
    "source" TEXT NOT NULL DEFAULT 'local_scan',
    "type" TEXT NOT NULL,
    "priority" TEXT NOT NULL DEFAULT 'NORMAL',
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "estimatedValue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "reason" TEXT NOT NULL DEFAULT '',
    "nextAction" TEXT,
    "lastOrderDate" TIMESTAMP(3),
    "lastContactedAt" TIMESTAMP(3),
    "idempotencyKey" TEXT NOT NULL,
    "internalNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalesOpportunity_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SalesOpportunity_idempotencyKey_key" ON "SalesOpportunity"("idempotencyKey");
CREATE INDEX "SalesOpportunity_status_idx" ON "SalesOpportunity"("status");
CREATE INDEX "SalesOpportunity_type_idx" ON "SalesOpportunity"("type");
CREATE INDEX "SalesOpportunity_priority_idx" ON "SalesOpportunity"("priority");
CREATE INDEX "SalesOpportunity_customerEmail_idx" ON "SalesOpportunity"("customerEmail");

ALTER TABLE "SalesOpportunity" ADD CONSTRAINT "SalesOpportunity_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CommunicationApproval" ADD COLUMN "salesOpportunityId" TEXT;
CREATE INDEX "CommunicationApproval_salesOpportunityId_idx" ON "CommunicationApproval"("salesOpportunityId");
ALTER TABLE "CommunicationApproval" ADD CONSTRAINT "CommunicationApproval_salesOpportunityId_fkey" FOREIGN KEY ("salesOpportunityId") REFERENCES "SalesOpportunity"("id") ON DELETE SET NULL ON UPDATE CASCADE;
