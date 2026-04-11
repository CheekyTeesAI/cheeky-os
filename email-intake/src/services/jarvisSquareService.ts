/**
 * Jarvis Square operator — uses shared Square client from square.service.
 * Invoices/estimates: DRAFT only, delivery_method SHARE_MANUALLY, no publish.
 */
import { createHash } from "crypto";
import { ApiError, Client } from "square";
import type { CreateCustomerRequest } from "square";
import type { CreateInvoiceRequest } from "square";
import type { CreateOrderRequest } from "square";
import { getSquareClient, resolveSquareLocationId } from "./square.service";

function cents(amount: number): bigint {
  return BigInt(Math.round(amount * 100));
}

function mapSquareError(step: string, err: unknown): Error {
  if (err instanceof ApiError) {
    const detail =
      err.errors?.map((e) => e.detail || e.code).join("; ") || err.message;
    return new Error(`Square ${step}: ${detail}`);
  }
  return err instanceof Error ? err : new Error(String(err));
}

function idempotencyKey(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

export async function listDraftInvoicesForFollowup(): Promise<unknown[]> {
  const client = getSquareClient();
  const locationId = await resolveSquareLocationId(client);
  try {
    const res = await client.invoicesApi.searchInvoices({
      query: {
        filter: {
          locationIds: [locationId]
        },
        sort: {
          field: "INVOICE_SORT_DATE",
          order: "DESC"
        }
      }
    });
    const invoices = res.result?.invoices || [];
    return invoices.filter((inv) => String(inv.status || "").toUpperCase() === "DRAFT");
  } catch (e) {
    throw mapSquareError("searchInvoices", e);
  }
}

export async function searchCustomers(query: string): Promise<unknown[]> {
  const client = getSquareClient();
  const q = (query || "").trim();
  if (!q) return [];
  try {
    const res = await client.customersApi.searchCustomers({
      query: {
        filter: {
          emailAddress: { fuzzy: q }
        },
        sort: { field: "DEFAULT", order: "ASC" }
      },
      limit: BigInt(50)
    });
    return res.result?.customers || [];
  } catch (e) {
    throw mapSquareError("searchCustomers", e);
  }
}

async function createCustomerAndOrder(
  client: Client,
  locationId: string,
  customerName: string,
  quantity: number,
  unitPrice: number
): Promise<{ squareCustomerId: string; orderId: string }> {
  const emailLocal = createHash("sha256")
    .update(customerName.trim().toLowerCase())
    .digest("hex")
    .slice(0, 24);
  const createCustomerBody: CreateCustomerRequest = {
    idempotencyKey: idempotencyKey("jarvis-cust"),
    companyName: customerName,
    emailAddress: `cheeky+${emailLocal}@invoice.placeholder`
  };
  let custRes;
  try {
    custRes = await client.customersApi.createCustomer(createCustomerBody);
  } catch (e) {
    throw mapSquareError("createCustomer", e);
  }
  const squareCustomerId = custRes.result?.customer?.id;
  if (!squareCustomerId) {
    throw new Error("Square customer creation failed");
  }
  const orderBody: CreateOrderRequest = {
    idempotencyKey: idempotencyKey("jarvis-ord"),
    order: {
      locationId,
      customerId: squareCustomerId,
      lineItems: [
        {
          name: "Custom T-Shirts",
          quantity: String(quantity),
          basePriceMoney: {
            amount: cents(unitPrice),
            currency: "USD"
          }
        }
      ]
    }
  };
  let orderRes;
  try {
    orderRes = await client.ordersApi.createOrder(orderBody);
  } catch (e) {
    throw mapSquareError("createOrder", e);
  }
  const orderId = orderRes.result?.order?.id;
  if (!orderId) throw new Error("Square order creation failed");
  return { squareCustomerId, orderId };
}

async function createDraftInvoiceOnly(
  client: Client,
  locationId: string,
  squareCustomerId: string,
  orderId: string,
  title: string
): Promise<{ invoiceId: string; status: string }> {
  const due = new Date();
  due.setDate(due.getDate() + 30);
  const dueDate = due.toISOString().slice(0, 10);

  const invoiceBody: CreateInvoiceRequest = {
    idempotencyKey: idempotencyKey("jarvis-inv"),
    invoice: {
      locationId,
      orderId,
      primaryRecipient: {
        customerId: squareCustomerId
      },
      paymentRequests: [
        {
          requestType: "BALANCE",
          dueDate
        }
      ],
      deliveryMethod: "SHARE_MANUALLY",
      acceptedPaymentMethods: {
        card: true,
        bankAccount: false,
        squareGiftCard: false,
        cashAppPay: true
      },
      title
    }
  };

  let invRes;
  try {
    invRes = await client.invoicesApi.createInvoice(invoiceBody);
  } catch (e) {
    throw mapSquareError("createInvoice", e);
  }
  const invoice = invRes.result?.invoice;
  const invoiceId = invoice?.id;
  const status = invoice?.status || "UNKNOWN";
  if (!invoiceId) throw new Error("Square invoice creation failed");
  return { invoiceId, status };
}

export async function createDraftEstimate(input: {
  customerName: string;
  quantity: number;
  unitPrice: number;
}): Promise<{ invoiceId: string; status: string }> {
  const client = getSquareClient();
  const locationId = await resolveSquareLocationId(client);
  const { squareCustomerId, orderId } = await createCustomerAndOrder(
    client,
    locationId,
    input.customerName,
    input.quantity,
    input.unitPrice
  );
  return createDraftInvoiceOnly(
    client,
    locationId,
    squareCustomerId,
    orderId,
    `Estimate — ${input.customerName}`
  );
}

export async function createDraftInvoice(input: {
  customerName: string;
  quantity: number;
  unitPrice: number;
}): Promise<{ invoiceId: string; status: string }> {
  const client = getSquareClient();
  const locationId = await resolveSquareLocationId(client);
  const { squareCustomerId, orderId } = await createCustomerAndOrder(
    client,
    locationId,
    input.customerName,
    input.quantity,
    input.unitPrice
  );
  return createDraftInvoiceOnly(
    client,
    locationId,
    squareCustomerId,
    orderId,
    `Invoice — ${input.customerName}`
  );
}
