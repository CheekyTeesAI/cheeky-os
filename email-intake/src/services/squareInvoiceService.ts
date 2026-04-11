import { db } from "../db/client";
import {
  createInvoice,
  createOrder,
  dollarsToCents,
  getOrCreateCustomer,
  getSquareLocationId,
  type SquarePaymentRequest,
} from "../lib/squareClient";
import { OrderNotFoundError } from "./orderEvaluator";

function toDueDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export class OrderNotEligibleForInvoiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OrderNotEligibleForInvoiceError";
  }
}

export async function createSquareDraftInvoiceForOrder(orderId: string): Promise<{
  success: true;
  squareCustomerId: string;
  squareOrderId: string;
  squareInvoiceId: string;
  squareInvoiceNumber: string | null;
}> {
  const order = await db.order.findUnique({ where: { id: orderId } });
  if (!order) {
    throw new OrderNotFoundError(orderId);
  }

  if (!order.isApproved) {
    throw new OrderNotEligibleForInvoiceError(
      "Order must be approved (isApproved) before creating a Square draft invoice"
    );
  }

  const status = String(order.status ?? "").toUpperCase();
  if (status !== "QUOTE_READY" && status !== "APPROVED") {
    throw new OrderNotEligibleForInvoiceError(
      `Order status must be QUOTE_READY or APPROVED (current: ${order.status})`
    );
  }

  const quoted = order.quotedAmount;
  if (quoted === null || quoted === undefined || quoted <= 0) {
    throw new OrderNotEligibleForInvoiceError(
      "quotedAmount is required and must be greater than zero"
    );
  }

  const depositMoney =
    order.depositRequired !== null && order.depositRequired !== undefined
      ? order.depositRequired
      : quoted * 0.5;

  const depositPercent = Math.min(1, Math.max(0, depositMoney / quoted));

  const invoiceExpiresAt = new Date();
  invoiceExpiresAt.setDate(invoiceExpiresAt.getDate() + 14);
  const dueDate = toDueDate(invoiceExpiresAt);

  const locationId = getSquareLocationId();

  const { customerId: squareCustomerId } = await getOrCreateCustomer({
    customerName: order.customerName,
    email: order.email,
    phone: order.phone,
  });

  const totalCents = Number(dollarsToCents(quoted));
  const depositCents = Math.min(
    totalCents,
    Math.max(0, Math.round(depositMoney * 100))
  );

  let paymentRequests: SquarePaymentRequest[];
  if (depositCents <= 0 || depositCents >= totalCents) {
    paymentRequests = [{ request_type: "BALANCE", due_date: dueDate }];
  } else {
    paymentRequests = [
      {
        request_type: "FIXED_AMOUNT",
        due_date: dueDate,
        fixed_amount_requested_money: {
          amount: depositCents,
          currency: "USD",
        },
      },
      { request_type: "BALANCE", due_date: dueDate },
    ];
  }

  const { orderId: squareOrderId } = await createOrder({
    locationId,
    customerId: squareCustomerId,
    lineName: "Custom Apparel Order",
    quantity: "1",
    amountCents: dollarsToCents(quoted),
  });

  // Invoice remains DRAFT. Later: Square Invoices publish via POST /v2/invoices/{id}/publish (not here).
  const inv = await createInvoice({
    locationId,
    customerId: squareCustomerId,
    orderId: squareOrderId,
    title: `Draft — ${order.customerName}`,
    paymentRequests,
  });

  await db.order.update({
    where: { id: orderId },
    data: {
      squareCustomerId,
      squareOrderId,
      squareInvoiceId: inv.invoiceId,
      squareInvoiceNumber: inv.invoiceNumber,
      depositPercent,
      invoiceExpiresAt,
      status: "INVOICE_DRAFTED",
    },
  });

  return {
    success: true,
    squareCustomerId,
    squareOrderId,
    squareInvoiceId: inv.invoiceId,
    squareInvoiceNumber: inv.invoiceNumber,
  };
}
