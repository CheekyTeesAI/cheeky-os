"use strict";
/**
 * Carolina Made vendor API boundary.
 * Real HTTP is only used when CAROLINA_MADE_ENABLED=true and credentials are set.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.CarolinaMadeConfigError = void 0;
exports.isCarolinaMadeEnabled = isCarolinaMadeEnabled;
exports.searchProduct = searchProduct;
exports.checkInventory = checkInventory;
exports.createOrder = createOrder;
class CarolinaMadeConfigError extends Error {
    constructor(message) {
        super(message);
        this.name = "CarolinaMadeConfigError";
    }
}
exports.CarolinaMadeConfigError = CarolinaMadeConfigError;
function isCarolinaMadeEnabled() {
    return (String(process.env.CAROLINA_MADE_ENABLED ?? "")
        .trim()
        .toLowerCase() === "true");
}
function getLiveConfig() {
    if (!isCarolinaMadeEnabled()) {
        throw new CarolinaMadeConfigError("Carolina Made live API requires CAROLINA_MADE_ENABLED=true");
    }
    const baseUrl = String(process.env.CAROLINA_MADE_API_BASE_URL ?? "")
        .trim()
        .replace(/\/$/, "");
    const apiKey = String(process.env.CAROLINA_MADE_API_KEY ?? "").trim();
    const apiSecret = String(process.env.CAROLINA_MADE_API_SECRET ?? "").trim();
    const missing = [];
    if (!baseUrl)
        missing.push("CAROLINA_MADE_API_BASE_URL");
    if (!apiKey)
        missing.push("CAROLINA_MADE_API_KEY");
    if (!apiSecret)
        missing.push("CAROLINA_MADE_API_SECRET");
    if (missing.length > 0) {
        throw new CarolinaMadeConfigError(`Carolina Made enabled but missing: ${missing.join(", ")}`);
    }
    return { baseUrl, apiKey, apiSecret };
}
function stubId(prefix, seed) {
    let h = 0;
    for (let i = 0; i < seed.length; i++) {
        h = (h * 31 + seed.charCodeAt(i)) >>> 0;
    }
    return `${prefix}-${h.toString(36)}`;
}
/** Stub: deterministic fake search results. */
async function searchProduct(query) {
    if (!isCarolinaMadeEnabled()) {
        const q = String(query ?? "").trim();
        return {
            simulated: true,
            query: q,
            results: [
                {
                    styleCode: "64000",
                    name: "Stub Tee (simulated)",
                    matchScore: 1,
                },
                {
                    styleCode: "SF500",
                    name: "Stub Hoodie (simulated)",
                    matchScore: 0.5,
                },
            ],
        };
    }
    const { baseUrl, apiKey, apiSecret } = getLiveConfig();
    const url = `${baseUrl}/v1/products/search`;
    const res = await fetch(url, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
            "X-API-Secret": apiSecret,
        },
        body: JSON.stringify({ query: String(query ?? "").trim() }),
    });
    const text = await res.text();
    let body = { raw: text };
    try {
        body = JSON.parse(text);
    }
    catch {
        /* keep raw */
    }
    if (!res.ok) {
        throw new Error(`Carolina Made searchProduct failed HTTP ${res.status}: ${text.slice(0, 300)}`);
    }
    return body;
}
/** Stub: inventory check simulation. */
async function checkInventory(styleCode, color, sizeBreakdown) {
    if (!isCarolinaMadeEnabled()) {
        const style = String(styleCode ?? "").trim() || "64000";
        return {
            simulated: true,
            styleCode: style,
            color: color ?? null,
            sizeBreakdown: sizeBreakdown ?? null,
            available: true,
            estimatedShipDays: 3,
            message: "Simulated inventory OK (CAROLINA_MADE_ENABLED!=true)",
        };
    }
    const { baseUrl, apiKey, apiSecret } = getLiveConfig();
    const url = `${baseUrl}/v1/inventory/check`;
    const res = await fetch(url, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
            "X-API-Secret": apiSecret,
        },
        body: JSON.stringify({
            styleCode: String(styleCode ?? "").trim(),
            color: color ?? undefined,
            sizeBreakdown: sizeBreakdown ?? undefined,
        }),
    });
    const text = await res.text();
    let body = { raw: text };
    try {
        body = JSON.parse(text);
    }
    catch {
        /* keep raw */
    }
    if (!res.ok) {
        throw new Error(`Carolina Made checkInventory failed HTTP ${res.status}: ${text.slice(0, 300)}`);
    }
    return body;
}
/**
 * Placeholder live order call. Stub mode should not invoke this from the service layer.
 * When disabled, returns a simulated confirmation (for tests that call the client directly).
 */
async function createOrder(payload) {
    if (!isCarolinaMadeEnabled()) {
        const seed = JSON.stringify(payload ?? {});
        return {
            simulated: true,
            externalOrderId: stubId("SIM-CM", seed),
            status: "SUBMITTED",
            message: "Simulated Carolina Made order (enable CAROLINA_MADE_ENABLED for live)",
            receivedAt: new Date().toISOString(),
        };
    }
    const { baseUrl, apiKey, apiSecret } = getLiveConfig();
    const url = `${baseUrl}/v1/orders`;
    const res = await fetch(url, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
            "X-API-Secret": apiSecret,
        },
        body: JSON.stringify(payload ?? {}),
    });
    const text = await res.text();
    let body = { raw: text };
    try {
        body = JSON.parse(text);
    }
    catch {
        /* keep raw */
    }
    if (!res.ok) {
        throw new Error(`Carolina Made createOrder failed HTTP ${res.status}: ${text.slice(0, 300)}`);
    }
    const rec = body;
    const ext = rec.externalOrderId ??
        rec.orderId ??
        rec.id ??
        null;
    return {
        ...rec,
        externalOrderId: ext,
    };
}
