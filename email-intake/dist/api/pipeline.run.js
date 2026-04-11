"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runPipeline = runPipeline;
const orders_create_1 = require("./orders.create");
const quote_generate_1 = require("./quote.generate");
const invoice_create_1 = require("./invoice.create");
async function runPipeline(req, res) {
    try {
        const { customerName, email, items, notes } = req.body;
        if (!items) {
            return res.status(400).json({
                success: false,
                error: "Missing items"
            });
        }
        // STEP 1 — ORDER
        let orderResult = {};
        await (0, orders_create_1.createOrder)({ body: { customerName, email, items, notes } }, {
            json: (data) => (orderResult = data),
            status: () => ({ json: (data) => (orderResult = data) })
        });
        // STEP 2 — QUOTE
        let quoteResult = {};
        await (0, quote_generate_1.generateQuote)({ body: { items } }, {
            json: (data) => (quoteResult = data),
            status: () => ({ json: (data) => (quoteResult = data) })
        });
        // STEP 3 — INVOICE
        let invoiceResult = {};
        await (0, invoice_create_1.createInvoice)({ body: { quote: quoteResult.quote } }, {
            json: (data) => (invoiceResult = data),
            status: () => ({ json: (data) => (invoiceResult = data) })
        });
        return res.json({
            success: true,
            pipeline: {
                order: orderResult.order,
                quote: quoteResult.quote,
                invoice: invoiceResult.invoice
            }
        });
    }
    catch (err) {
        console.error("Pipeline failed", err);
        return res.status(500).json({
            success: false,
            error: "Pipeline failed"
        });
    }
}
