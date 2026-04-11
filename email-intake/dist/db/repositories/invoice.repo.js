"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.saveInvoiceReference = saveInvoiceReference;
exports.getUnpaidInvoicesWithoutFollowup = getUnpaidInvoicesWithoutFollowup;
exports.markFollowupSent = markFollowupSent;
const client_1 = require("../client");
/**
 * Persists a minimal invoice row keyed by Square invoice id in `hash`.
 */
async function saveInvoiceReference(input) {
    await client_1.db.invoice.create({
        data: {
            customerId: input.customerId,
            quantity: input.quantity,
            unitPrice: input.unitPrice,
            total: input.total,
            deposit: 0,
            hash: input.squareInvoiceId,
            status: input.status
        }
    });
}
const ONE_HOUR_MS = 60 * 60 * 1000;
/**
 * Unpaid (not PAID) local invoice rows older than 1 hour that have not received a follow-up yet.
 */
async function getUnpaidInvoicesWithoutFollowup() {
    const cutoff = new Date(Date.now() - ONE_HOUR_MS);
    return client_1.db.invoice.findMany({
        where: {
            followUpSent: false,
            status: { not: "PAID" },
            createdAt: { lt: cutoff }
        }
    });
}
async function markFollowupSent(invoiceId) {
    await client_1.db.invoice.update({
        where: { id: invoiceId },
        data: { followUpSent: true }
    });
}
