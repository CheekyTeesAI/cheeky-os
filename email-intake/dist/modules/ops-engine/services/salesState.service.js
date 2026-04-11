"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSalesState = getSalesState;
const pipeline_service_1 = require("../../command-layer/services/pipeline.service");
const squareEstimate_service_1 = require("../../command-layer/services/squareEstimate.service");
function safeAmount(n) {
    return typeof n === "number" && Number.isFinite(n) ? n : 0;
}
async function getSalesState() {
    let invoices = [];
    let estimates = [];
    let customers = [];
    try {
        const [invRes, estRes, custRes] = await Promise.all([
            (0, squareEstimate_service_1.getRecentInvoices)(),
            (0, squareEstimate_service_1.getRecentEstimates)(),
            (0, squareEstimate_service_1.getRecentCustomers)()
        ]);
        if (invRes.success) {
            invoices = invRes.data.map((r) => ({
                amount: safeAmount(r.amount),
                status: String(r.status ?? "")
            }));
        }
        if (estRes.success) {
            estimates = estRes.data.map((r) => ({
                amount: safeAmount(r.amount)
            }));
        }
        if (custRes.success) {
            customers = custRes.data;
        }
    }
    catch {
        invoices = [];
        estimates = [];
        customers = [];
    }
    const recentInvoiceTotal = invoices.reduce((s, r) => s + r.amount, 0);
    const unpaidInvoiceCount = invoices.filter((r) => String(r.status).toUpperCase() !== "PAID").length;
    const estimateCount = estimates.length;
    const estimateValue = estimates.reduce((s, r) => s + r.amount, 0);
    let pipelineSnapshot = {
        openLeadCount: 0,
        hotLeadCount: 0
    };
    let nextBestActions = [];
    try {
        const pipeline = (0, pipeline_service_1.getPipeline)();
        pipelineSnapshot = {
            openLeadCount: pipeline.summary.openLeadCount,
            hotLeadCount: pipeline.summary.hotLeadCount
        };
        nextBestActions = (0, pipeline_service_1.getNextBestActions)().map((a) => ({
            name: a.name,
            value: a.value,
            stage: a.stage,
            score: a.score,
            recommendedAction: a.recommendedAction,
            script: a.script
        }));
    }
    catch {
        // leave defaults
    }
    return {
        revenue: {
            recentInvoiceTotal,
            unpaidInvoiceCount,
            estimateCount,
            estimateValue
        },
        pipeline: {
            openDeals: pipelineSnapshot.openLeadCount,
            hotDeals: pipelineSnapshot.hotLeadCount,
            nextBestActions
        },
        activity: {
            recentCustomers: customers.length
        }
    };
}
