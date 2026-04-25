/**
 * Square service layer — draft invoices only (never publish/send).
 * Uses official `square` SDK via compiled helpers from dist/services/square.service.js.
 */

const path = require("path");

const memoryService = require(path.join(__dirname, "memoryService.js"));

let squareCore = null;
function loadSquareCore() {
  if (squareCore) return squareCore;
  try {
    squareCore = require(path.join(__dirname, "..", "..", "dist", "services", "square.service.js"));
  } catch (e) {
    throw new Error(
      "Square service requires `npm run build` in email-intake (dist/services/square.service.js missing)"
    );
  }
  return squareCore;
}

function getClientAndLocation() {
  const { getSquareClient, resolveSquareLocationId } = loadSquareCore();
  const client = getSquareClient();
  return { client, resolveSquareLocationId };
}

function getClientSafe() {
  if (!(process.env.SQUARE_ACCESS_TOKEN || "").trim()) {
    return null;
  }
  try {
    return loadSquareCore().getSquareClient();
  } catch {
    return null;
  }
}

function memLog(type, data) {
  try {
    if (typeof memoryService.logEvent === "function") {
      memoryService.logEvent(type, data);
    }
  } catch (_) {
    /* optional */
  }
}

/**
 * Normalize SDK / REST customer shapes for operator matching.
 * @param {object} c
 */
function normalizeCustomer(c) {
  if (!c || !c.id) return null;
  const emailRaw = c.emailAddress || c.email_address;
  const emailStr =
    typeof emailRaw === "string"
      ? emailRaw
      : emailRaw && emailRaw.emailAddress
        ? String(emailRaw.emailAddress)
        : emailRaw && emailRaw.email_address
          ? String(emailRaw.email_address)
          : "";
  return {
    id: c.id,
    given_name: c.givenName ?? c.given_name ?? "",
    family_name: c.familyName ?? c.family_name ?? "",
    company_name: c.companyName ?? c.company_name ?? "",
    email_address: emailStr ? { email_address: emailStr } : { email_address: "" },
  };
}

/**
 * @param {string} [query] filter substring on name/email (case-insensitive)
 * @returns {Promise<Array<object>>} normalized customers
 */
async function getCustomers(query) {
  const client = getClientSafe();
  if (!client) {
    return [];
  }
  const q = String(query || "")
    .trim()
    .toLowerCase();
  const out = [];
  let cursor = undefined;
  try {
    for (let i = 0; i < 20; i++) {
      const req = {
        query: {
          sort: { field: "CREATED_AT", order: "DESC" },
        },
        limit: BigInt(100),
      };
      if (cursor) req.cursor = cursor;
      const res = await client.customersApi.searchCustomers(req);
      const batch = res.result?.customers || [];
      for (const c of batch) {
        const n = normalizeCustomer(c);
        if (n) out.push(n);
      }
      cursor = res.result?.cursor;
      if (!cursor) break;
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    memLog("square_error", { step: "getCustomers", message: msg });
    throw err;
  }
  if (!q) return out;
  return out.filter((c) => {
    const name = `${c.given_name} ${c.family_name}`.trim().toLowerCase();
    const comp = String(c.company_name || "").toLowerCase();
    const em = c.email_address?.email_address
      ? String(c.email_address.email_address).toLowerCase()
      : "";
    return name.includes(q) || comp.includes(q) || em.includes(q);
  });
}

/**
 * Best-effort name match (same heuristics as operator).
 * @param {string} name
 * @returns {Promise<object | null>} normalized customer or null
 */
async function getCustomerByName(name) {
  const hint = String(name || "")
    .trim()
    .toLowerCase();
  if (!hint) return null;
  let customers = [];
  try {
    customers = await getCustomers("");
  } catch {
    return null;
  }
  const h = hint;
  for (const c of customers) {
    const display =
      [c.given_name, c.family_name].filter(Boolean).join(" ").trim() ||
      c.company_name ||
      "";
    const d = display.toLowerCase();
    const gn = String(c.given_name || "").toLowerCase();
    if (
      (d && (d.includes(h) || h.includes(d.split(/\s+/)[0]))) ||
      (gn && (gn.includes(h) || h.includes(gn)))
    ) {
      memLog("customer_found", { customerId: c.id, hint: name });
      return c;
    }
  }
  const emailMatch = customers.find((c) => {
    const em = c.email_address?.email_address
      ? String(c.email_address.email_address).toLowerCase()
      : "";
    return em && (em.includes(h) || h.includes(em.split("@")[0]));
  });
  if (emailMatch) {
    memLog("customer_found", { customerId: emailMatch.id, hint: name, via: "email" });
    return emailMatch;
  }
  return null;
}

/**
 * Recent orders for the default location (read-only).
 * @returns {Promise<Array<object>>}
 */
async function getOrders() {
  const client = getClientSafe();
  if (!client) {
    return [];
  }
  const { resolveSquareLocationId } = loadSquareCore();
  let locationId;
  try {
    locationId = await resolveSquareLocationId(client);
  } catch (err) {
    memLog("square_error", {
      step: "getOrders.location",
      message: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
  try {
    const res = await client.ordersApi.searchOrders({
      locationIds: [locationId],
      limit: BigInt(40),
      query: {
        sort: { sortField: "CREATED_AT", sortOrder: "DESC" },
      },
    });
    return res.result?.orders || [];
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    memLog("square_error", { step: "getOrders", message: msg });
    return [];
  }
}

/**
 * Create Square order + invoice in DRAFT only (does not publish or charge).
 * @param {{ customerId: string, lineItems: Array<{ name?: string, quantity?: number, price?: number }> }} data
 * @returns {Promise<{ success: boolean, squareInvoiceId?: string, invoiceId?: string, status?: string, amount?: number, error?: string }>}
 */
async function createDraftInvoice(data) {
  const { ApiError } = require("square");
  if (!(process.env.SQUARE_ACCESS_TOKEN || "").trim()) {
    return { success: false, error: "SQUARE_ACCESS_TOKEN not set" };
  }
  const customerId = String((data && data.customerId) || "").trim();
  const lineItems = Array.isArray(data && data.lineItems) ? data.lineItems : [];

  if (!customerId) {
    return { success: false, error: "customerId is required" };
  }
  if (lineItems.length === 0) {
    return { success: false, error: "lineItems must be a non-empty array" };
  }

  let amount = 0;
  for (const li of lineItems) {
    const qty = Math.max(1, Math.floor(Number(li.quantity) || 1));
    const price = Number(li.price);
    if (!Number.isFinite(price) || price <= 0) {
      return { success: false, error: "Each line item needs a positive price" };
    }
    amount += qty * price;
  }
  amount = Math.round(amount * 100) / 100;

  try {
    const { getSquareClient, resolveSquareLocationId } = loadSquareCore();
    const client = getSquareClient();
    const locationId = await resolveSquareLocationId(client);

    const orderBody = {
      idempotencyKey: `cheeky-svc-ord-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      order: {
        locationId,
        customerId,
        lineItems: lineItems.map((li) => {
          const qty = Math.max(1, Math.floor(Number(li.quantity) || 1));
          const price = Number(li.price);
          const unitCents = Math.round(price * 100);
          return {
            name: String(li.name || "Item").trim() || "Item",
            quantity: String(qty),
            basePriceMoney: {
              amount: BigInt(unitCents),
              currency: "USD",
            },
          };
        }),
      },
    };

    const orderRes = await client.ordersApi.createOrder(orderBody);
    const orderId = orderRes.result?.order?.id;
    if (!orderId) {
      const msg =
        orderRes.result?.errors?.map((e) => e.detail || e.code).join("; ") ||
        "Square order creation failed";
      memLog("square_error", { step: "createOrder", message: msg });
      return { success: false, error: msg };
    }

    const due = new Date();
    due.setDate(due.getDate() + 14);
    const dueDate = due.toISOString().slice(0, 10);

    const invoiceBody = {
      idempotencyKey: `cheeky-svc-inv-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      invoice: {
        locationId,
        orderId,
        primaryRecipient: { customerId },
        paymentRequests: [
          {
            requestType: "BALANCE",
            dueDate,
          },
        ],
        deliveryMethod: "SHARE_MANUALLY",
        acceptedPaymentMethods: {
          card: true,
          bankAccount: false,
          squareGiftCard: false,
          cashAppPay: true,
        },
        title: "Draft invoice",
      },
    };

    const invRes = await client.invoicesApi.createInvoice(invoiceBody);
    const invoice = invRes.result?.invoice;
    const invoiceId = invoice?.id || "";
    const st = String(invoice?.status || "DRAFT").toUpperCase();

    memLog("invoice_created", {
      squareInvoiceId: invoiceId,
      amount,
      status: st,
      draftOnly: true,
    });

    return {
      success: true,
      squareInvoiceId: invoiceId,
      invoiceId,
      status: st === "DRAFT" || st === "UNPAID" ? "DRAFT" : st,
      amount,
    };
  } catch (err) {
    const msg =
      err instanceof ApiError
        ? err.errors?.map((e) => e.detail || e.code).join("; ") || err.message
        : err instanceof Error
          ? err.message
          : String(err);
    memLog("square_error", { step: "createDraftInvoice", message: msg });
    return { success: false, error: msg };
  }
}

module.exports = {
  createDraftInvoice,
  getCustomers,
  getOrders,
  getCustomerByName,
};
