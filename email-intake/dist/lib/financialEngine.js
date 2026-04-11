"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.calculateMargin = calculateMargin;
exports.calculatePPH = calculatePPH;
exports.enforceInvoiceFloor = enforceInvoiceFloor;
exports.validateMinimumQuantity = validateMinimumQuantity;
exports.calculateDeposit = calculateDeposit;
exports.evaluateOrder = evaluateOrder;
const MIN_MARGIN_RATIO = 0.45;
const MIN_PPH = 50;
const MIN_INVOICE = 250;
const QUANTITY_MIN_DTG_DTF_EMB = 12;
const QUANTITY_MIN_SCREEN = 24;
const DEPOSIT_RATE = 0.5;
const DEPOSIT_ROUND = 25;
function calculateMargin(revenue, cost) {
    if (revenue <= 0)
        return Number.NaN;
    return (revenue - cost) / revenue;
}
function calculatePPH(profit, laborHours) {
    if (laborHours <= 0)
        return Number.NaN;
    return profit / laborHours;
}
function enforceInvoiceFloor(revenue) {
    if (revenue < MIN_INVOICE) {
        return { valid: false, reason: "Below minimum invoice" };
    }
    return { valid: true };
}
function validateMinimumQuantity(quantity, method) {
    const m = method.trim().toUpperCase();
    if (m === "DTG" || m === "DTF" || m === "EMB") {
        if (quantity < QUANTITY_MIN_DTG_DTF_EMB) {
            return {
                valid: false,
                reason: "Quantity below minimum for DTG, DTF, or embroidery",
            };
        }
    }
    else if (m === "SCREEN") {
        if (quantity < QUANTITY_MIN_SCREEN) {
            return {
                valid: false,
                reason: "Quantity below minimum for screen print",
            };
        }
    }
    return { valid: true };
}
function calculateDeposit(revenue, blankCost) {
    const baseDeposit = revenue * DEPOSIT_RATE;
    const covering = Math.max(baseDeposit, blankCost);
    return Math.ceil(covering / DEPOSIT_ROUND) * DEPOSIT_ROUND;
}
function evaluateOrder(input) {
    const errors = [];
    const margin = calculateMargin(input.revenue, input.cost);
    const profit = input.revenue - input.cost;
    if (Number.isNaN(margin) || margin < MIN_MARGIN_RATIO) {
        errors.push("Below minimum margin");
    }
    let pph;
    if (input.laborHours <= 0) {
        errors.push("Labor hours must be positive");
        pph = Number.NaN;
    }
    else {
        pph = calculatePPH(profit, input.laborHours);
        if (Number.isNaN(pph) || pph < MIN_PPH) {
            errors.push("Below minimum profit per labor hour");
        }
    }
    const invoice = enforceInvoiceFloor(input.revenue);
    if (invoice.valid === false) {
        errors.push(invoice.reason);
    }
    const quantityCheck = validateMinimumQuantity(input.quantity, input.method);
    if (!quantityCheck.valid && quantityCheck.reason) {
        errors.push(quantityCheck.reason);
    }
    const depositRequired = calculateDeposit(input.revenue, input.blankCost);
    return {
        approved: errors.length === 0,
        margin,
        pph,
        depositRequired,
        errors,
    };
}
