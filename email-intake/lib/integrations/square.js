"use strict";

const config = require("../config");

/**
 * @returns {"sandbox"|"production"}
 */
function getSquareEnvironmentName() {
  if (process.env.SQUARE_ENVIRONMENT) {
    return String(process.env.SQUARE_ENVIRONMENT).trim().toLowerCase() ===
      "sandbox" ?
        "sandbox"
    : "production";
  }
  const token = String(config.squareAccessToken || "");
  if (token.includes("sandbox")) return "sandbox";
  return "production";
}

function getSquareEnvironment() {
  const { Environment } = require("square");
  const name = getSquareEnvironmentName();
  console.log("Square Environment:", name === "sandbox" ? "sandbox" : "production");
  return name === "sandbox" ? Environment.Sandbox : Environment.Production;
}

function getClient() {
  const { Client } = require("square");
  const token = String(config.squareAccessToken || "").trim();
  console.log("Square Token Loaded:", token ? "YES" : "NO");
  if (!token) throw new Error("SQUARE_ACCESS_TOKEN is not set");
  return new Client({
    bearerAuthCredentials: { accessToken: token },
    environment: getSquareEnvironment(),
  });
}

/**
 * @param {unknown} err
 * @param {string} msg
 */
function isSquareUnauthorized(err, msg) {
  const blob = `${msg} ${err && typeof err === "object" && "message" in err ? String(/** @type {{ message?: string }} */ (err).message) : ""}`;
  if (/401|could not be authorized|not authorized|unauthorized/i.test(blob)) {
    return true;
  }
  const sc =
    err && typeof err === "object" && "statusCode" in err ?
      /** @type {{ statusCode?: number }} */ (err).statusCode
    : undefined;
  return sc === 401;
}

async function resolveSquareLocationId(client) {
  const envId = String(config.squareLocationId || "").trim();
  const listRes = await client.locationsApi.listLocations();
  const locations = listRes.result?.locations || [];
  if (envId && !locations.some((loc) => loc.id === envId)) {
    throw new Error(
      `Invalid SQUARE_LOCATION_ID for this token (expected a location id from your Square account).`
    );
  }
  if (envId && locations.some((loc) => loc.id === envId)) {
    return envId;
  }
  const active = locations.find(
    (loc) => String(loc.status || "").toUpperCase() === "ACTIVE"
  );
  if (active?.id) return active.id;
  throw new Error("No ACTIVE Square location — set SQUARE_LOCATION_ID in .env");
}

function cents(amount) {
  return BigInt(Math.round(Number(amount || 0) * 100));
}

function idem(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function squareApiMessage(err) {
  if (!err || typeof err !== "object") {
    return err instanceof Error ? err.message : String(err);
  }
  const any = /** @type {{ errors?: Array<{ detail?: string; code?: string }>, message?: string }} */ (
    err
  );
  if (Array.isArray(any.errors) && any.errors.length) {
    return any.errors
      .map((e) => String(e.detail || e.code || "").trim())
      .filter(Boolean)
      .join("; ") || any.message || "Square API error";
  }
  return any.message || (err instanceof Error ? err.message : String(err));
}

/**
 * @param {{
 *   firstName?: string,
 *   lastName?: string,
 *   customerGivenName?: string,
 *   customerFamilyName?: string,
 *   email?: string,
 *   phone?: string,
 *   company?: string,
 *   items?: Array<{ name?: string, quantity?: number, unitAmount?: number }>,
 *   note?: string,
 *   reference?: string,
 *   quantity?: number
 * }} data
 */
async function createDraftEstimate(data) {
  const input = data && typeof data === "object" ? data : {};
  console.log("💰 Creating Square estimate:", input);

  if (!config.hasSquare()) {
    return {
      success: true,
      mode: "stub",
      message: "Square not configured",
      debug: input,
    };
  }

  try {
    const client = getClient();
    const locationId = await resolveSquareLocationId(client);

    const given = String(
      input.firstName ?? input.customerGivenName ?? "Customer"
    ).trim();
    const family = String(
      input.lastName ?? input.customerFamilyName ?? ""
    ).trim();
    const email = String(input.email || "").trim();
    const phone = String(input.phone || "").trim();
    const company = String(input.company || "").trim();

    const custBody = {
      idempotencyKey: idem("cheeky-est-cust"),
      givenName: given,
      familyName: family,
      ...(email ? { emailAddress: email } : {}),
      ...(phone ? { phoneNumber: phone } : {}),
      ...(company ? { companyName: company } : {}),
    };

    const custRes = await client.customersApi.createCustomer(custBody);
    const customerId = custRes.result?.customer?.id;
    if (!customerId) {
      throw new Error("Square customer creation failed");
    }

    let items = Array.isArray(input.items) ? input.items : [];
    if (!items.length && input.quantity) {
      items = [
        {
          name: "Custom Apparel",
          quantity: Number(input.quantity) || 1,
          unitAmount: 0,
        },
      ];
    }
    if (!items.length) {
      items = [{ name: "Custom Apparel", quantity: 1, unitAmount: 0 }];
    }

    const lineItems = items.map((it) => ({
      name: String(it.name || "Item").slice(0, 128),
      quantity: String(Math.max(1, Number(it.quantity) || 1)),
      basePriceMoney: {
        amount: cents(it.unitAmount ?? 0),
        currency: "USD",
      },
    }));

    const orderRes = await client.ordersApi.createOrder({
      idempotencyKey: idem("cheeky-est-ord"),
      order: {
        locationId,
        customerId,
        lineItems,
      },
    });
    const orderId = orderRes.result?.order?.id;
    if (!orderId) throw new Error("Square order creation failed");

    const due = new Date();
    due.setDate(due.getDate() + 30);
    const dueDate = due.toISOString().slice(0, 10);
    const title = `Estimate — ${String(input.reference || "Cheeky").slice(0, 80)}`;

    const invRes = await client.invoicesApi.createInvoice({
      idempotencyKey: idem("cheeky-est-inv"),
      invoice: {
        locationId,
        orderId,
        primaryRecipient: { customerId },
        title,
        paymentRequests: [{ requestType: "BALANCE", dueDate }],
        deliveryMethod: "SHARE_MANUALLY",
        acceptedPaymentMethods: {
          card: true,
          bankAccount: false,
          squareGiftCard: false,
          cashAppPay: true,
        },
      },
    });

    const invoice = invRes.result?.invoice;
    const invoiceId = invoice?.id;
    if (!invoiceId) {
      throw new Error("Square draft invoice creation failed");
    }

    const publicUrl = invoice.publicUrl || invoice.invoiceUrl || null;

    return {
      success: true,
      mode: "live",
      estimateId: invoiceId,
      url: publicUrl || undefined,
      raw: invRes.result,
      message: "Estimate created",
    };
  } catch (err) {
    const e = err instanceof Error ? err : new Error(String(err));
    const msg = squareApiMessage(err);
    console.error("[square] createDraftEstimate", msg);
    if (isSquareUnauthorized(err, msg)) {
      return {
        success: false,
        mode: "live",
        error: "SQUARE_AUTH_FAILED",
        message: "Token/environment mismatch",
        hint: "Check SQUARE_ENVIRONMENT and token type",
        stack: e.stack,
      };
    }
    return {
      success: false,
      mode: "live",
      message: msg,
      stack: e.stack,
    };
  }
}

/**
 * Same pipeline as estimate; title prefix Invoice.
 * @param {Parameters<typeof createDraftEstimate>[0]} data
 */
async function createDraftInvoice(data) {
  if (!config.hasSquare()) {
    return {
      success: true,
      mode: "stub",
      message: "Square not configured",
      debug: data,
    };
  }
  const merged = {
    ...data,
    reference: data.reference || "Invoice",
  };
  const r = await createDraftEstimate(merged);
  if (r.estimateId) {
    return {
      ...r,
      message: r.message.replace("Estimate", "Invoice draft"),
    };
  }
  return r;
}

/** Legacy names used by older action code */
async function createEstimate(data) {
  return createDraftEstimate(normalizeLegacyPayload(data));
}

async function createInvoice(data) {
  return createDraftInvoice(normalizeLegacyPayload(data));
}

async function saveCustomer(data) {
  if (!config.hasSquare()) {
    return {
      success: true,
      mode: "stub",
      message: "Square not configured",
      debug: data,
    };
  }
  try {
    const client = getClient();
    const p = normalizeLegacyPayload(data);
    const body = {
      idempotencyKey: idem("cheeky-sq-cust"),
      givenName: p.customerGivenName,
      familyName: p.customerFamilyName,
      ...(p.email ? { emailAddress: p.email } : {}),
      ...(p.phone ? { phoneNumber: p.phone } : {}),
      ...(p.company ? { companyName: p.company } : {}),
    };
    const res = await client.customersApi.createCustomer(body);
    return {
      success: true,
      mode: "live",
      message: "Customer created in Square",
      customerId: res.result?.customer?.id,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, mode: "stub", message: msg };
  }
}

async function sendEmail() {
  return { success: false, mode: "stub", message: "Use outlook integration" };
}

function normalizeLegacyPayload(payload) {
  const name = String(payload.name || "").trim();
  const parts = name.split(/\s+/).filter(Boolean);
  return {
    customerGivenName: parts[0] || "Customer",
    customerFamilyName: parts.slice(1).join(" ") || "",
    email: payload.email || "",
    phone: payload.phone || "",
    company: payload.company || "",
    reference: name || "Order",
    note: payload.raw || "",
    items:
      payload.quantity ?
        [
          {
            name: "Custom Apparel",
            quantity: Number(payload.quantity) || 1,
            unitAmount: 0,
          },
        ]
      : [],
  };
}

module.exports = {
  createDraftEstimate,
  createDraftInvoice,
  createEstimate,
  createInvoice,
  saveCustomer,
  sendEmail,
};
