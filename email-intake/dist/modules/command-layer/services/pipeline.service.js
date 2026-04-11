"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSquarePipeline = getSquarePipeline;
exports.getPipeline = getPipeline;
exports.getNextBestActions = getNextBestActions;
const types_1 = require("../models/types");
const squareEstimate_service_1 = require("./squareEstimate.service");
const lead_service_1 = require("./lead.service");
const STAGE_WEIGHTS = {
    NEW: 0.2,
    CONTACTED: 0.4,
    QUOTED: 0.6,
    FOLLOW_UP: 0.7,
    CLOSE_ATTEMPT: 0.85,
    DEPOSIT_PAID: 1
};
function safeValue(value) {
    return typeof value === "number" ? value : 0;
}
let squarePipelineCache = [];
let squarePipelineRefreshing = false;
function mapEstimateToLead(row) {
    return {
        id: `sq_est_${row.id}`,
        name: row.customerId || "Square Customer",
        company: "",
        estimatedValue: safeValue(row.amount),
        stage: types_1.LeadStage.QUOTED,
        status: types_1.LeadStatus.HOT,
        nextAction: "Follow up on estimate",
        nextActionDate: row.createdAt,
        createdAt: row.createdAt,
        updatedAt: row.createdAt
    };
}
function mapInvoiceToLead(row) {
    const paid = String(row.status || "").toUpperCase() === "PAID";
    return {
        id: `sq_inv_${row.id}`,
        name: row.customerId || "Square Customer",
        company: "",
        estimatedValue: safeValue(row.amount),
        stage: paid ? types_1.LeadStage.DEPOSIT_PAID : types_1.LeadStage.CLOSE_ATTEMPT,
        status: types_1.LeadStatus.HOT,
        nextAction: paid ? "Confirm production details" : "Close invoice / collect payment",
        nextActionDate: row.createdAt,
        createdAt: row.createdAt,
        updatedAt: row.createdAt,
        depositPaid: paid
    };
}
async function getSquarePipeline() {
    const [estimatesRes, invoicesRes] = await Promise.all([
        (0, squareEstimate_service_1.getRecentEstimates)(),
        (0, squareEstimate_service_1.getRecentInvoices)()
    ]);
    const estimateLeads = estimatesRes.data.map(mapEstimateToLead);
    const invoiceLeads = invoicesRes.data.map(mapInvoiceToLead);
    return [...estimateLeads, ...invoiceLeads];
}
function refreshSquarePipelineCache() {
    if (squarePipelineRefreshing)
        return;
    squarePipelineRefreshing = true;
    getSquarePipeline()
        .then((rows) => {
        squarePipelineCache = rows;
    })
        .catch(() => {
        // Keep last cache on Square read errors.
    })
        .finally(() => {
        squarePipelineRefreshing = false;
    });
}
function getCombinedPipelineLeads() {
    const localLeads = (0, lead_service_1.getActiveLeads)();
    const combined = [...localLeads, ...squarePipelineCache];
    const deduped = Array.from(new Map(combined.map((lead) => [lead.id, lead])).values());
    return deduped.filter((lead) => lead.stage !== types_1.LeadStage.WON && lead.stage !== types_1.LeadStage.LOST);
}
function getPipeline() {
    refreshSquarePipelineCache();
    const activeLeads = getCombinedPipelineLeads();
    const stages = {
        NEW: [],
        CONTACTED: [],
        QUOTED: [],
        FOLLOW_UP: [],
        CLOSE_ATTEMPT: [],
        DEPOSIT_PAID: []
    };
    for (const lead of activeLeads) {
        if (lead.stage in stages) {
            const stageKey = lead.stage;
            stages[stageKey].push(lead);
        }
    }
    const quotedValue = [...stages.QUOTED, ...stages.FOLLOW_UP, ...stages.CLOSE_ATTEMPT].reduce((sum, lead) => sum + safeValue(lead.estimatedValue), 0);
    const weightedPipelineValue = Object.keys(stages).reduce((sum, stageKey) => {
        const stageTotal = stages[stageKey].reduce((inner, lead) => inner + safeValue(lead.estimatedValue), 0);
        return sum + stageTotal * STAGE_WEIGHTS[stageKey];
    }, 0);
    const nextActions = activeLeads
        .filter((lead) => typeof lead.nextActionDate === "string" && lead.nextActionDate.trim() !== "")
        .sort((a, b) => {
        const at = new Date(a.nextActionDate).getTime();
        const bt = new Date(b.nextActionDate).getTime();
        return at - bt;
    });
    return {
        summary: {
            openLeadCount: activeLeads.length,
            hotLeadCount: activeLeads.filter((lead) => lead.status === types_1.LeadStatus.HOT).length,
            quotedValue,
            weightedPipelineValue
        },
        stages,
        nextActions
    };
}
function stageScore(stage) {
    if (stage === types_1.LeadStage.CLOSE_ATTEMPT)
        return 5;
    if (stage === types_1.LeadStage.FOLLOW_UP)
        return 4;
    if (stage === types_1.LeadStage.QUOTED)
        return 3;
    if (stage === types_1.LeadStage.CONTACTED)
        return 2;
    if (stage === types_1.LeadStage.NEW)
        return 1;
    return 0;
}
function valueScore(value) {
    if (value > 2000)
        return 5;
    if (value >= 1000)
        return 3;
    return 1;
}
function ageScore(createdAt) {
    if (!createdAt)
        return 0;
    const t = new Date(createdAt).getTime();
    if (!Number.isFinite(t))
        return 0;
    const ageDays = (Date.now() - t) / (24 * 60 * 60 * 1000);
    if (ageDays > 5)
        return 5;
    if (ageDays > 2)
        return 3;
    return 0;
}
function statusScore(status) {
    if (status === types_1.LeadStatus.HOT)
        return 3;
    if (status === types_1.LeadStatus.WARM)
        return 2;
    return 0;
}
function recommendedActionForStage(stage) {
    if (stage === types_1.LeadStage.CLOSE_ATTEMPT)
        return "Call and ask for deposit";
    if (stage === types_1.LeadStage.FOLLOW_UP)
        return "Send follow-up message";
    if (stage === types_1.LeadStage.QUOTED)
        return "Push to close — use urgency";
    return "Send follow-up message";
}
function getNextBestActions() {
    refreshSquarePipelineCache();
    const leads = getCombinedPipelineLeads();
    return leads
        .map((lead) => {
        const value = safeValue(lead.estimatedValue);
        const score = valueScore(value) +
            stageScore(lead.stage) +
            ageScore(lead.createdAt) +
            statusScore(lead.status);
        const name = lead.name || lead.company || "Customer";
        const recommendedAction = recommendedActionForStage(lead.stage);
        const script = `Hey ${name}, just checking in on your order for $${value}.\n\n` +
            "I’ve got production slots closing for this week — if you want to move forward, I can lock it in today with the deposit.";
        return {
            name,
            value,
            stage: lead.stage,
            score,
            recommendedAction,
            script
        };
    })
        .sort((a, b) => b.score - a.score)
        .slice(0, 5);
}
