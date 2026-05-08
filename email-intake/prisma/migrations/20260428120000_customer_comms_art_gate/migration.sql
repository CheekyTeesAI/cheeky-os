-- Additive: customer comms types + art approval gate (no auto-send)
ALTER TABLE "Order" ADD COLUMN "artApprovalStatus" TEXT DEFAULT 'NOT_REQUESTED';
ALTER TABLE "Order" ADD COLUMN "artApprovedAt" TIMESTAMP(3);
ALTER TABLE "Order" ADD COLUMN "artApprovalNote" TEXT;

ALTER TABLE "CommunicationApproval" ADD COLUMN "messageType" TEXT;

ALTER TABLE "CommunicationApproval" ALTER COLUMN "status" SET DEFAULT 'DRAFT';
