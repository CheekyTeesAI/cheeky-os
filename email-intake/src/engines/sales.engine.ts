import { OrderDepositStatus } from "@prisma/client";
import { ValidatedInvoicePayload } from "../core/gatekeeper";
import { createInvoice } from "../services/square.service";
import { db } from "../db/client";
import { findOrCreateByName } from "../db/repositories/customer.repo";
import { saveInvoiceReference } from "../db/repositories/invoice.repo";

export interface VoiceInvoiceSuccess {
  success: true;
  invoiceId: string;
  status: string;
}

/**
 * Creates/finds local customer, creates Square invoice, persists invoice reference.
 */
export async function runCreateInvoice(
  payload: ValidatedInvoicePayload
): Promise<VoiceInvoiceSuccess> {
  const customer = await findOrCreateByName(payload.customerName);
  const { invoiceId, status } = await createInvoice({
    customerName: payload.customerName,
    quantity: payload.quantity,
    unitPrice: payload.price
  });
  const total = payload.quantity * payload.price;
  await saveInvoiceReference({
    customerId: customer.id,
    quantity: payload.quantity,
    unitPrice: payload.price,
    total,
    squareInvoiceId: invoiceId,
    status
  });
  await db.order.create({
    data: {
      customerName: payload.customerName,
      email: customer.email,
      quantity: payload.quantity,
      unitPrice: payload.price,
      total,
      totalAmount: total,
      depositRequired: Math.round(total * 0.5 * 100) / 100,
      squareInvoiceId: invoiceId,
      status: "QUOTE_SENT",
      depositStatus: OrderDepositStatus.NONE,
    },
  });
  return { success: true, invoiceId, status };
}
