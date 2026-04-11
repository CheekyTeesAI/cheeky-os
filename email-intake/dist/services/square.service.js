"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSquareClient = getSquareClient;
exports.resolveSquareLocationId = resolveSquareLocationId;
exports.createInvoice = createInvoice;
const crypto_1 = require("crypto");
const square_1 = require("square");
function resolveSquareEnvironment(token) {
    const explicit = (process.env.SQUARE_ENVIRONMENT || "").trim().toLowerCase();
    if (explicit === "production") {
        return square_1.Environment.Production;
    }
    if (explicit === "sandbox") {
        return square_1.Environment.Sandbox;
    }
    // Token shape hint (Square access tokens): sandbox often contains "-EAAA" segment.
    if (token.startsWith("EAAAl") && token.includes("-EAAA")) {
        return square_1.Environment.Sandbox;
    }
    if (token.startsWith("EAAAl")) {
        return square_1.Environment.Production;
    }
    return square_1.Environment.Sandbox;
}
function getClient() {
    const token = (process.env.SQUARE_ACCESS_TOKEN || "").trim();
    if (!token) {
        throw new Error("SQUARE_ACCESS_TOKEN is not set");
    }
    const environment = resolveSquareEnvironment(token);
    return new square_1.Client({
        bearerAuthCredentials: { accessToken: token },
        environment
    });
}
/** Same Square `Client` instance resolution as `createInvoice` — for Jarvis and other callers. */
function getSquareClient() {
    return getClient();
}
/**
 * Uses SQUARE_LOCATION_ID when it exists for this seller; otherwise first ACTIVE location.
 * Avoids 403 when a production location id is stored but the token targets sandbox (or vice versa).
 */
async function resolveSquareLocationId(client) {
    const envId = (process.env.SQUARE_LOCATION_ID || "").trim();
    const listRes = await client.locationsApi.listLocations();
    const locations = listRes.result?.locations || [];
    if (envId && locations.some((loc) => loc.id === envId)) {
        return envId;
    }
    const active = locations.find((loc) => String(loc.status || "").toUpperCase() === "ACTIVE");
    if (active?.id) {
        return active.id;
    }
    if (envId) {
        return envId;
    }
    throw new Error("SQUARE_LOCATION_ID is not set and no ACTIVE Square location was found");
}
function cents(amount) {
    return BigInt(Math.round(amount * 100));
}
function mapSquareError(step, err) {
    if (err instanceof square_1.ApiError) {
        const detail = err.errors?.map((e) => e.detail || e.code).join("; ") || err.message;
        return new Error(`Square ${step}: ${detail}`);
    }
    return err instanceof Error ? err : new Error(String(err));
}
/**
 * Creates a Square order + draft invoice, publishes it, returns Square invoice id and status.
 */
async function createInvoice(data) {
    const client = getClient();
    const locationId = await resolveSquareLocationId(client);
    const emailLocal = (0, crypto_1.createHash)("sha256")
        .update(data.customerName.trim().toLowerCase())
        .digest("hex")
        .slice(0, 24);
    const createCustomerBody = {
        idempotencyKey: `cheeky-cust-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
        companyName: data.customerName,
        emailAddress: `cheeky+${emailLocal}@invoice.placeholder`
    };
    let custRes;
    try {
        custRes = await client.customersApi.createCustomer(createCustomerBody);
    }
    catch (e) {
        throw mapSquareError("createCustomer", e);
    }
    const squareCustomerId = custRes.result?.customer?.id;
    if (!squareCustomerId) {
        const msg = custRes.result?.errors?.map((e) => e.detail || e.code).join("; ") ||
            "Square customer creation failed";
        throw new Error(msg);
    }
    const orderBody = {
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
    }
    catch (e) {
        throw mapSquareError("createOrder", e);
    }
    const orderId = orderRes.result?.order?.id;
    if (!orderId) {
        const msg = orderRes.result?.errors?.map((e) => e.detail || e.code).join("; ") ||
            "Square order creation failed";
        throw new Error(msg);
    }
    const due = new Date();
    due.setDate(due.getDate() + 30);
    const dueDate = due.toISOString().slice(0, 10);
    const invoiceBody = {
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
    }
    catch (e) {
        throw mapSquareError("createInvoice", e);
    }
    const invoice = invRes.result?.invoice;
    const invoiceId = invoice?.id;
    const version = invoice?.version;
    if (!invoiceId || version === undefined || version === null) {
        const msg = invRes.result?.errors?.map((e) => e.detail || e.code).join("; ") ||
            "Square invoice creation failed";
        throw new Error(msg);
    }
    const publishBody = {
        version,
        idempotencyKey: `cheeky-pub-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
    };
    let pubRes;
    try {
        pubRes = await client.invoicesApi.publishInvoice(invoiceId, publishBody);
    }
    catch (e) {
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
