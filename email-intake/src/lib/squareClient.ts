export class SquareConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SquareConfigError";
  }
}

function getSquareConfig(): {
  token: string;
  locationId: string;
  baseUrl: string;
  version: string;
} {
  const token = String(process.env.SQUARE_ACCESS_TOKEN ?? "").trim();
  const locationId = String(process.env.SQUARE_LOCATION_ID ?? "").trim();
  const baseUrl = (
    String(process.env.SQUARE_API_BASE_URL ?? "").trim() ||
    "https://connect.squareup.com"
  ).replace(/\/$/, "");
  const version = (
    String(process.env.SQUARE_API_VERSION ?? "").trim() || "2025-10-16"
  ).trim();

  const missing: string[] = [];
  if (!token) missing.push("SQUARE_ACCESS_TOKEN");
  if (!locationId) missing.push("SQUARE_LOCATION_ID");
  if (missing.length > 0) {
    throw new SquareConfigError(
      `Square is not configured. Set: ${missing.join(", ")}`
    );
  }
  return { token, locationId, baseUrl, version };
}

/** Location id from env (validates Square config). */
export function getSquareLocationId(): string {
  return getSquareConfig().locationId;
}

function idempotencyKey(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

function squareErrorsMessage(body: Record<string, unknown>): string {
  const errors = body.errors;
  if (!Array.isArray(errors) || errors.length === 0) {
    return "Unknown Square error";
  }
  return errors
    .map((e) => {
      const rec = e as Record<string, unknown>;
      return String(rec.detail ?? rec.code ?? JSON.stringify(e));
    })
    .join("; ");
}

export async function squareRequest(
  path: string,
  options: RequestInit & { idempotencyKey?: string } = {}
): Promise<unknown> {
  const { token, baseUrl, version } = getSquareConfig();
  const url = `${baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
  const headers = new Headers(options.headers);
  headers.set("Authorization", `Bearer ${token}`);
  headers.set("Square-Version", version);
  const method = String(options.method ?? "GET").toUpperCase();
  if (method !== "GET" && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const idem = options.idempotencyKey ?? idempotencyKey("sq-req");
  headers.set("Idempotency-Key", idem);

  const { idempotencyKey: _omit, ...fetchInit } = options;
  const res = await fetch(url, { ...fetchInit, headers });
  const text = await res.text();
  let body: Record<string, unknown> = {};
  if (text) {
    try {
      body = JSON.parse(text) as Record<string, unknown>;
    } catch {
      throw new Error(`Square returned non-JSON (${res.status}): ${text.slice(0, 200)}`);
    }
  }
  if (!res.ok) {
    throw new Error(
      `Square HTTP ${res.status}: ${squareErrorsMessage(body) || text.slice(0, 300)}`
    );
  }
  if (Array.isArray(body.errors) && body.errors.length > 0) {
    throw new Error(`Square: ${squareErrorsMessage(body)}`);
  }
  return body;
}

export function dollarsToCents(amount: number): bigint {
  return BigInt(Math.round(amount * 100));
}

export interface GetOrCreateCustomerInput {
  customerName: string;
  email: string;
  phone?: string | null;
}

export async function getOrCreateCustomer(
  input: GetOrCreateCustomerInput
): Promise<{ customerId: string }> {
  const email = input.email.trim();
  if (!email) {
    throw new Error("Customer email is required for Square");
  }

  const searchBody = {
    query: {
      filter: {
        email_address: { exact: email },
      },
    },
    limit: 1,
  };

  const searchRes = (await squareRequest("/v2/customers/search", {
    method: "POST",
    body: JSON.stringify(searchBody),
    idempotencyKey: idempotencyKey("sq-cust-search"),
  })) as { customers?: Array<{ id?: string }> };

  const existing = searchRes.customers?.[0]?.id;
  if (existing) {
    return { customerId: existing };
  }

  const createBody: Record<string, unknown> = {
    idempotency_key: idempotencyKey("sq-cust-create"),
    company_name: input.customerName.trim().slice(0, 255),
    email_address: email,
  };
  const phone = (input.phone ?? "").trim();
  if (phone) {
    createBody.phone_number = phone;
  }

  const createRes = (await squareRequest("/v2/customers", {
    method: "POST",
    body: JSON.stringify(createBody),
    idempotencyKey: idempotencyKey("sq-cust-post"),
  })) as { customer?: { id?: string } };

  const customerId = createRes.customer?.id;
  if (!customerId) {
    throw new Error("Square create customer returned no id");
  }
  return { customerId };
}

export interface CreateSquareOrderInput {
  locationId: string;
  customerId: string;
  lineName: string;
  quantity: string;
  amountCents: bigint;
}

export async function createOrder(
  input: CreateSquareOrderInput
): Promise<{ orderId: string }> {
  const body = {
    idempotency_key: idempotencyKey("sq-order"),
    order: {
      location_id: input.locationId,
      customer_id: input.customerId,
      line_items: [
        {
          name: input.lineName,
          quantity: input.quantity,
          base_price_money: {
            amount: Number(input.amountCents),
            currency: "USD",
          },
        },
      ],
    },
  };

  const res = (await squareRequest("/v2/orders", {
    method: "POST",
    body: JSON.stringify(body),
    idempotencyKey: idempotencyKey("sq-order-hdr"),
  })) as { order?: { id?: string } };

  const orderId = res.order?.id;
  if (!orderId) {
    throw new Error("Square create order returned no id");
  }
  return { orderId };
}

export interface SquarePaymentRequest {
  request_type: string;
  due_date: string;
  fixed_amount_requested_money?: { amount: number; currency: string };
}

export interface CreateSquareInvoiceInput {
  locationId: string;
  customerId: string;
  orderId: string;
  title: string;
  paymentRequests: SquarePaymentRequest[];
}

/** Creates a Square invoice (remains DRAFT — do not publish here). */
export async function createInvoice(
  input: CreateSquareInvoiceInput
): Promise<{ invoiceId: string; invoiceNumber: string | null; status: string }> {
  const body = {
    idempotency_key: idempotencyKey("sq-inv"),
    invoice: {
      location_id: input.locationId,
      order_id: input.orderId,
      primary_recipient: {
        customer_id: input.customerId,
      },
      payment_requests: input.paymentRequests,
      delivery_method: "SHARE_MANUALLY",
      accepted_payment_methods: {
        card: true,
        bank_account: false,
        square_gift_card: false,
        cash_app_pay: true,
      },
      title: input.title,
    },
  };

  const res = (await squareRequest("/v2/invoices", {
    method: "POST",
    body: JSON.stringify(body),
    idempotencyKey: idempotencyKey("sq-inv-hdr"),
  })) as {
    invoice?: {
      id?: string;
      invoice_number?: string;
      status?: string;
    };
  };

  const inv = res.invoice;
  if (!inv?.id) {
    throw new Error("Square create invoice returned no id");
  }
  return {
    invoiceId: inv.id,
    invoiceNumber: inv.invoice_number ?? null,
    status: inv.status ?? "UNKNOWN",
  };
}

function parseInvoiceVersion(raw: unknown): number {
  if (typeof raw === "bigint") return Number(raw);
  if (typeof raw === "number" && !Number.isNaN(raw)) return raw;
  if (typeof raw === "string" && raw.trim() !== "") {
    const n = Number(raw);
    if (!Number.isNaN(n)) return n;
  }
  throw new Error("Square invoice response missing valid version");
}

/** GET /v2/invoices/{id} — current version required to publish. */
export async function retrieveSquareInvoice(invoiceId: string): Promise<{
  invoiceId: string;
  version: number;
  status: string;
}> {
  const res = (await squareRequest(
    `/v2/invoices/${encodeURIComponent(invoiceId)}`,
    { method: "GET" }
  )) as {
    invoice?: {
      id?: string;
      version?: unknown;
      status?: string;
    };
  };
  const inv = res.invoice;
  if (!inv?.id) {
    throw new Error("Square retrieve invoice returned no invoice");
  }
  return {
    invoiceId: inv.id,
    version: parseInvoiceVersion(inv.version),
    status: String(inv.status ?? ""),
  };
}

/** POST /v2/invoices/{id}/publish — sends an existing draft invoice. */
export async function publishSquareInvoice(invoiceId: string): Promise<{
  invoiceId: string;
  status: string;
}> {
  const current = await retrieveSquareInvoice(invoiceId);
  const body = {
    idempotency_key: idempotencyKey("sq-inv-publish"),
    version: current.version,
  };
  const res = (await squareRequest(
    `/v2/invoices/${encodeURIComponent(invoiceId)}/publish`,
    {
      method: "POST",
      body: JSON.stringify(body),
      idempotencyKey: idempotencyKey("sq-inv-publish-hdr"),
    }
  )) as {
    invoice?: { id?: string; status?: string };
  };
  const inv = res.invoice;
  const outId = inv?.id ?? invoiceId;
  if (!outId) {
    throw new Error("Square publish invoice returned no invoice id");
  }
  return {
    invoiceId: outId,
    status: String(inv?.status ?? "UNKNOWN"),
  };
}
