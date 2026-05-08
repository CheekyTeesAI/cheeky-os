"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ArtFileStatus = exports.WorkOrderStatus = exports.GarmentOrderStatus = void 0;
exports.determineGarmentOrderingNeeded = determineGarmentOrderingNeeded;
exports.buildPostDepositGarmentFields = buildPostDepositGarmentFields;
/** Operational garment lifecycle (string column; vendor paths may use SUBMITTED/DRAFT). */
exports.GarmentOrderStatus = {
    NOT_NEEDED: "NOT_NEEDED",
    NEEDED: "NEEDED",
    ORDER_PENDING: "ORDER_PENDING",
    ORDERED: "ORDERED",
    RECEIVED: "RECEIVED",
};
exports.WorkOrderStatus = {
    NOT_CREATED: "NOT_CREATED",
    READY: "READY",
    COMPLETED: "COMPLETED",
};
exports.ArtFileStatus = {
    NOT_READY: "NOT_READY",
    READY: "READY",
    APPROVED: "APPROVED",
};
/**
 * True when physical blanks must be ordered before production.
 * Safe default: assume garments are needed unless explicitly not.
 */
function determineGarmentOrderingNeeded(order) {
    const cur = String(order.garmentOrderStatus ?? "").toUpperCase();
    if (cur === exports.GarmentOrderStatus.NOT_NEEDED)
        return false;
    const lines = order.lineItems ?? [];
    if (lines.length > 0) {
        const qty = lines.reduce((s, li) => s + (Number(li.quantity) || 0), 0);
        if (qty > 0)
            return true;
    }
    const q = Number(order.quantity) || 0;
    if (q > 0)
        return true;
    const gt = String(order.garmentType ?? "").trim();
    if (gt.length > 0)
        return true;
    return true;
}
function buildPostDepositGarmentFields(order) {
    const needed = determineGarmentOrderingNeeded(order);
    return {
        garmentOrderNeeded: needed,
        garmentOrderStatus: needed
            ? exports.GarmentOrderStatus.ORDER_PENDING
            : exports.GarmentOrderStatus.NOT_NEEDED,
        workOrderStatus: exports.WorkOrderStatus.NOT_CREATED,
        artFileStatus: exports.ArtFileStatus.NOT_READY,
    };
}
