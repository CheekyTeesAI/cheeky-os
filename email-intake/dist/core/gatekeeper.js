"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.gatekeeper = gatekeeper;
/**
 * Validates BrainOutput for invoice creation.
 * Rejects low confidence or missing invoice fields.
 */
function gatekeeper(output) {
    if (output.confidence < 0.8) {
        return { ok: false, stage: "gatekeeper", error: "Low confidence" };
    }
    if (output.intent !== "CREATE_INVOICE") {
        return {
            ok: false,
            stage: "gatekeeper",
            error: "Intent is not CREATE_INVOICE"
        };
    }
    const customerName = typeof output.customerName === "string" ? output.customerName.trim() : "";
    const quantity = output.quantity;
    const price = output.unitPrice;
    if (!customerName) {
        return { ok: false, stage: "gatekeeper", error: "Missing customerName" };
    }
    if (quantity === undefined ||
        quantity === null ||
        Number.isNaN(Number(quantity))) {
        return { ok: false, stage: "gatekeeper", error: "Missing quantity" };
    }
    if (price === undefined || price === null || Number.isNaN(Number(price))) {
        return { ok: false, stage: "gatekeeper", error: "Missing price" };
    }
    const q = Number(quantity);
    const p = Number(price);
    if (q <= 0 || p <= 0) {
        return {
            ok: false,
            stage: "gatekeeper",
            error: "quantity and price must be positive"
        };
    }
    const payload = {
        customerName,
        quantity: q,
        price: p
    };
    return { ok: true, payload };
}
