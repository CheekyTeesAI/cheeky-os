"use strict";
/**
 * Single internal contract for intake paths (email, AI, etc.).
 * Pure mapping only — no I/O, no persistence, no order-engine changes.
 * Downstream handlers still receive legacy `{ customerName, email, items, notes }` via `toCreateOrderPipelineBody`.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeEmailIntake = normalizeEmailIntake;
exports.normalizeAiIntake = normalizeAiIntake;
exports.toCreateOrderPipelineBody = toCreateOrderPipelineBody;
function asRecord(x) {
    if (x == null || typeof x !== "object" || Array.isArray(x))
        return null;
    return x;
}
function isoNow() {
    return new Date().toISOString();
}
/**
 * Email webhook / handler body: `{ subject?, from?, text? }` (legacy shape preserved at HTTP layer).
 */
function normalizeEmailIntake(body) {
    const b = asRecord(body) ?? {};
    const subject = typeof b.subject === "string" ? b.subject : "";
    const from = typeof b.from === "string" ? b.from : "";
    const text = typeof b.text === "string" ? b.text : "";
    const customerName = from || "Email Customer";
    const email = from || "";
    const items = [subject || "Custom Order Request"];
    const notes = text || "";
    return {
        source: "email",
        sourceType: "email",
        customer: {
            name: customerName,
            email: email || null,
            phone: null,
        },
        order: {
            notes,
            requestedItems: items,
            dueDate: null,
            rawText: text || null,
        },
        art: {
            designRef: null,
            attachments: [],
        },
        meta: {
            receivedAt: isoNow(),
            rawPayload: body,
        },
    };
}
function aiItemsToRequestedStrings(items) {
    if (!Array.isArray(items))
        return [];
    const out = [];
    for (const row of items) {
        const r = asRecord(row);
        if (!r)
            continue;
        const q = typeof r.quantity === "number" && Number.isFinite(r.quantity)
            ? r.quantity
            : 1;
        const t = typeof r.type === "string" ? r.type : "other";
        out.push(`${q} ${t}`);
    }
    return out;
}
/**
 * After AI JSON parse (or fallback object), plus original user text for audit.
 */
function normalizeAiIntake(parsed, rawText) {
    const p = asRecord(parsed) ?? {};
    const customerName = typeof p.customerName === "string" && p.customerName.trim()
        ? p.customerName.trim()
        : "Fallback Customer";
    const email = typeof p.email === "string" && p.email.trim() ? p.email.trim() : "";
    const notes = typeof p.notes === "string" ? p.notes : undefined;
    const requestedItems = aiItemsToRequestedStrings(p.items);
    return {
        source: "ai",
        sourceType: "ai",
        customer: {
            name: customerName,
            email: email || null,
            phone: null,
        },
        order: {
            notes,
            requestedItems,
            dueDate: null,
            rawText: rawText,
        },
        art: {
            designRef: null,
            attachments: [],
        },
        meta: {
            receivedAt: isoNow(),
            rawPayload: { parsed, rawText },
        },
    };
}
/**
 * Maps normalized intake to the body shape expected by `createOrder` / `runPipeline` (unchanged contract).
 */
function toCreateOrderPipelineBody(n) {
    const items = n.order.requestedItems;
    const notes = n.sourceType === "email"
        ? n.order.notes ?? ""
        : n.order.notes;
    return {
        customerName: n.customer.name ?? "",
        email: n.customer.email ?? "",
        items,
        notes,
    };
}
