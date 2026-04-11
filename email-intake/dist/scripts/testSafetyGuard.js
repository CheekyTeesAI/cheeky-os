"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const safetyGuard_service_1 = require("../services/safetyGuard.service");
function baseOrder(overrides = {}) {
    return {
        id: "test-order",
        createdAt: new Date(),
        updatedAt: new Date(),
        customerName: "Test Customer",
        email: "test@example.com",
        phone: null,
        notes: "",
        status: "INTAKE",
        quotedAmount: null,
        estimatedCost: null,
        margin: null,
        pph: null,
        depositRequired: null,
        depositReceived: false,
        amountPaid: 0,
        depositPaidAt: null,
        finalPaidAt: null,
        squareLastEventId: null,
        squareInvoiceStatus: null,
        squarePaymentStatus: null,
        quantity: null,
        garmentType: null,
        printMethod: null,
        blockedReason: null,
        isApproved: false,
        squareCustomerId: null,
        squareOrderId: null,
        squareInvoiceNumber: null,
        depositPercent: null,
        invoiceExpiresAt: null,
        squareInvoiceSentAt: null,
        quoteExpiresAt: null,
        squareInvoicePublished: false,
        unitPrice: null,
        total: null,
        squareInvoiceId: null,
        followUpSent: false,
        isRush: false,
        productionStartedAt: null,
        productionCompletedAt: null,
        jobCreated: false,
        jobCreatedAt: null,
        productionStatus: null,
        outlookMessageId: null,
        routingStatus: null,
        productionTypeFinal: null,
        assignedProductionTo: null,
        routedAt: null,
        garmentVendor: null,
        garmentOrderStatus: null,
        garmentOrderPlacedAt: null,
        digitizingRequired: false,
        digitizingStatus: null,
        digitizingRequestedAt: null,
        ...overrides,
    };
}
function logDecision(label, order, action) {
    const d = (0, safetyGuard_service_1.evaluateActionSafety)(order, action);
    console.log(`[${label}] ${action} -> allowed=${d.allowed}${d.reason ? ` | ${d.reason}` : ""}`);
}
const actions = [
    "PUBLISH_INVOICE",
    "ORDER_GARMENTS",
    "REQUEST_DIGITIZING",
    "ROUTE_PRODUCTION",
    "CREATE_JOB",
    "MARK_QC_READY",
];
function main() {
    console.log("--- Scenario: approved but unpaid (QUOTE_READY) ---");
    const approvedUnpaid = baseOrder({
        isApproved: true,
        status: "QUOTE_READY",
        quotedAmount: 400,
        depositReceived: false,
    });
    actions.forEach((a) => logDecision("approved-unpaid", approvedUnpaid, a));
    console.log("\n--- Scenario: deposited production-ready ---");
    const deposited = baseOrder({
        depositReceived: true,
        status: "PRODUCTION_READY",
        quantity: 24,
        garmentType: "Tee",
        printMethod: "DTG",
        jobCreated: true,
        quotedAmount: 500,
    });
    actions.forEach((a) => logDecision("deposited", deposited, a));
    try {
        (0, safetyGuard_service_1.assertActionAllowed)(deposited, "ORDER_GARMENTS");
        console.log("assert ORDER_GARMENTS on deposited: OK");
    }
    catch (e) {
        console.log("assert ORDER_GARMENTS failed:", e);
    }
    console.log("\n--- Scenario: blocked order ---");
    const blocked = baseOrder({
        isApproved: true,
        status: "INVOICE_DRAFTED",
        quotedAmount: 300,
        blockedReason: "Below minimum invoice",
        squareInvoiceId: "inv_1",
    });
    actions.forEach((a) => logDecision("blocked", blocked, a));
    console.log("\n--- Scenario: embroidery order (deposited) ---");
    const emb = baseOrder({
        depositReceived: true,
        status: "DEPOSIT_PAID",
        printMethod: "EMB",
        quantity: 12,
        garmentType: "Polo",
    });
    actions.forEach((a) => logDecision("emb", emb, a));
    console.log("\n--- Scenario: job already created ---");
    const jobDone = baseOrder({
        depositReceived: true,
        status: "DEPOSIT_PAID",
        jobCreated: true,
        quantity: 12,
    });
    actions.forEach((a) => logDecision("job-exists", jobDone, a));
    try {
        (0, safetyGuard_service_1.assertActionAllowed)(jobDone, "CREATE_JOB");
        console.log("assert CREATE_JOB should not run — unexpected OK");
    }
    catch (e) {
        console.log("assert CREATE_JOB (expected fail):", e.message);
    }
}
main();
