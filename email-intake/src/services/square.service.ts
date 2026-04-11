import { createHash } from "crypto";
import { ApiError, Client, Environment } from "square";
import type { CreateCustomerRequest } from "square";
import type { CreateOrderRequest } from "square";
import type { CreateInvoiceRequest } from "square";
import type { PublishInvoiceRequest } from "square";

export interface SquareInvoiceInput {
  customerName: string;
  quantity: number;
  unitPrice: number;
}

function resolveSquareEnvironment(token: string): Environment {
  const explicit = (process.env.SQUARE_ENVIRONMENT || "").trim().toLowerCase();
  if (explicit === "production") {
    return Environment.Production;
  }
  if (explicit === "sandbox") {
    return Environment.Sandbox;
  }
  // Token shape hint (Square access tokens): sandbox often contains "-EAAA" segment.
  if (token.startsWith("EAAAl") && token.includes("-EAAA")) {
    return Environment.Sandbox;
  }
  if (token.startsWith("EAAAl")) {
    return Environment.Production;
  }
  return Environment.Sandbox;
}

function getClient(): Client {
  const token = (process.env.SQUARE_ACCESS_TOKEN || "").trim();
  if (!token) {
    throw new Error("SQUARE_ACCESS_TOKEN is not set");
  }
  const environment = resolveSquareEnvironment(token);
  return new Client({
    bearerAuthCredentials: { accessToken: token },
    environment
  });
}

/** Same Square `Client` instance resolution as `createInvoice` — for Jarvis and other callers. */
export function getSquareClient(): Client {
  return getClient();
}

/**
 * Uses SQUARE_LOCATION_ID when it exists for this seller; otherwise first ACTIVE location.
 * Avoids 403 when a production location id is stored but the token targets sandbox (or vice versa).
 */
export async function resolveSquareLocationId(client: Client): Promise<string> {
  const envId = (process.env.SQUARE_LOCATION_ID || "").trim();
  const listRes = await client.locationsApi.listLocations();
  const locations = listRes.result?.locations || [];
  if (envId && locations.some((loc) => loc.id === envId)) {
    return envId;
  }
  const active = locations.find(
    (loc) => String(loc.status || "").toUpperCase() === "ACTIVE"
  );
  if (active?.id) {
    return active.id;
  }
  if (envId) {
    return envId;
  }
  throw new Error("SQUARE_LOCATION_ID is not set and no ACTIVE Square location was found");
}

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

/**
 * Creates a Square order + draft invoice, publishes it, returns Square invoice id and status.
 */
export async function createInvoice(
  data: SquareInvoiceInput
): Promise<{ invoiceId: string; status: string }> {
  const client = getClient();
  const locationId = await resolveSquareLocationId(client);

  const emailLocal = createHash("sha256")
    .update(data.customerName.trim().toLowerCase())
    .digest("hex")
    .slice(0, 24);
  const createCustomerBody: CreateCustomerRequest = {
    idempotencyKey: `cheeky-cust-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    companyName: data.customerName,
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
    const msg =
      custRes.result?.errors?.map((e) => e.detail || e.code).join("; ") ||
      "Square customer creation failed";
    throw new Error(msg);
  }

  const orderBody: CreateOrderRequest = {
    idempotencyKey: `cheeky-ord-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    order: {
      locationId,
      customerId: squareCustomerId,
      lineItems: [
        {
          name: "Custom T-Shirts",
          quantity: String(data.quantity),
          basePriceMoney: {
            amount: cents(data.unitPrice),
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
  if (!orderId) {
    const msg =
      orderRes.result?.errors?.map((e) => e.detail || e.code).join("; ") ||
      "Square order creation failed";
    throw new Error(msg);
  }

  const due = new Date();
  due.setDate(due.getDate() + 30);
  const dueDate = due.toISOString().slice(0, 10);

  const invoiceBody: CreateInvoiceRequest = {
    idempotencyKey: `cheeky-inv-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
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
      title: `Invoice — ${data.customerName}`
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
  const version = invoice?.version;
  if (!invoiceId || version === undefined || version === null) {
    const msg =
      invRes.result?.errors?.map((e) => e.detail || e.code).join("; ") ||
      "Square invoice creation failed";
    throw new Error(msg);
  }

  const publishBody: PublishInvoiceRequest = {
    version,
    idempotencyKey: `cheeky-pub-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  };
  let pubRes;
  try {
    pubRes = await client.invoicesApi.publishInvoice(invoiceId, publishBody);
  } catch (e) {
    throw mapSquareError("publishInvoice", e);
  }
  if (pubRes.result?.errors?.length) {
    const msg = pubRes.result.errors.map((e) => e.detail || e.code).join("; ");
    throw new Error(msg || "Square publish invoice failed");
  }
  const published = pubRes.result?.invoice;
  const finalId = published?.id || invoiceId;

  return {
    invoiceId: finalId,
    status: "SENT"
  };
}
