"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runCreateInvoice = runCreateInvoice;
const square_service_1 = require("../services/square.service");
const client_1 = require("../db/client");
const customer_repo_1 = require("../db/repositories/customer.repo");
const invoice_repo_1 = require("../db/repositories/invoice.repo");
/**
 * Creates/finds local customer, creates Square invoice, persists invoice reference.
 */
async function runCreateInvoice(payload) {
    const customer = await (0, customer_repo_1.findOrCreateByName)(payload.customerName);
    const { invoiceId, status } = await (0, square_service_1.createInvoice)({
        customerName: payload.customerName,
        quantity: payload.quantity,
        unitPrice: payload.price
    });
    const total = payload.quantity * payload.price;
    await (0, invoice_repo_1.saveInvoiceReference)({
        customerId: customer.id,
        quantity: payload.quantity,
        unitPrice: payload.price,
        total,
        squareInvoiceId: invoiceId,
        status
    });
    await client_1.db.order.create({
        data: {
            customerName: payload.customerName,
            email: customer.email,
            quantity: payload.quantity,
            unitPrice: payload.price,
            total: payload.quantity * payload.price,
            squareInvoiceId: invoiceId,
            status: "SENT"
        }
    });
    return { success: true, invoiceId, status };
}
