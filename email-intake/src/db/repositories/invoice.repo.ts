import type { Invoice } from "@prisma/client";
import { db } from "../client";

export interface InvoiceRefInput {
  customerId: string;
  quantity: number;
  unitPrice: number;
  total: number;
  squareInvoiceId: string;
  status: string;
}

/**
 * Persists a minimal invoice row keyed by Square invoice id in `hash`.
 */
export async function saveInvoiceReference(input: InvoiceRefInput): Promise<void> {
  await db.invoice.create({
    data: {
      customerId: input.customerId,
      quantity: input.quantity,
      unitPrice: input.unitPrice,
      total: input.total,
      deposit: 0,
      hash: input.squareInvoiceId,
      status: input.status
    }
  });
}

const ONE_HOUR_MS = 60 * 60 * 1000;

/**
 * Unpaid (not PAID) local invoice rows older than 1 hour that have not received a follow-up yet.
 */
export async function getUnpaidInvoicesWithoutFollowup(): Promise<Invoice[]> {
  const cutoff = new Date(Date.now() - ONE_HOUR_MS);
  return db.invoice.findMany({
    where: {
      followUpSent: false,
      status: { not: "PAID" },
      createdAt: { lt: cutoff }
    }
  });
}

export async function markFollowupSent(invoiceId: string): Promise<void> {
  await db.invoice.update({
    where: { id: invoiceId },
    data: { followUpSent: true }
  });
}
