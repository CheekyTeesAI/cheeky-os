"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getEstimatesFollowup = getEstimatesFollowup;
exports.getCustomersSearch = getCustomersSearch;
exports.postEstimateCreate = postEstimateCreate;
exports.postInvoiceCreate = postInvoiceCreate;
const jarvisSquareService_1 = require("../services/jarvisSquareService");
async function getEstimatesFollowup(_req, res) {
    try {
        const invoices = await (0, jarvisSquareService_1.listDraftInvoicesForFollowup)();
        res.json({ success: true, invoices });
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        res.status(400).json({ success: false, error: message });
    }
}
async function getCustomersSearch(req, res) {
    try {
        const q = String(req.query.q ?? "").trim();
        const customers = await (0, jarvisSquareService_1.searchCustomers)(q);
        res.json({ success: true, customers });
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        res.status(400).json({ success: false, error: message });
    }
}
async function postEstimateCreate(req, res) {
    try {
        const { customerName, quantity, unitPrice } = req.body || {};
        if (typeof customerName !== "string" ||
            typeof quantity !== "number" ||
            typeof unitPrice !== "number") {
            res.status(400).json({
                success: false,
                error: "customerName (string), quantity (number), unitPrice (number) required"
            });
            return;
        }
        const out = await (0, jarvisSquareService_1.createDraftEstimate)({ customerName, quantity, unitPrice });
        res.json({ success: true, ...out });
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        res.status(400).json({ success: false, error: message });
    }
}
async function postInvoiceCreate(req, res) {
    try {
        const { customerName, quantity, unitPrice } = req.body || {};
        if (typeof customerName !== "string" ||
            typeof quantity !== "number" ||
            typeof unitPrice !== "number") {
            res.status(400).json({
                success: false,
                error: "customerName (string), quantity (number), unitPrice (number) required"
            });
            return;
        }
        const out = await (0, jarvisSquareService_1.createDraftInvoice)({ customerName, quantity, unitPrice });
        res.json({ success: true, ...out });
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        res.status(400).json({ success: false, error: message });
    }
}
