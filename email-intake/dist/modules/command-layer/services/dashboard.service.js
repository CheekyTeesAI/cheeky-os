"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTodayDashboard = getTodayDashboard;
const types_1 = require("../models/types");
const lead_service_1 = require("./lead.service");
const DAILY_REVENUE_TARGET = 4000;
function dateKey(value) {
    return value.toISOString().slice(0, 10);
}
function leadDateKey(value) {
    if (!value)
        return null;
    const t = new Date(value).getTime();
    if (!Number.isFinite(t))
        return null;
    return new Date(t).toISOString().slice(0, 10);
}
function safeValue(value) {
    return typeof value === "number" ? value : 0;
}
function getTodayDashboard() {
    const activeLeads = (0, lead_service_1.getActiveLeads)();
    const today = dateKey(new Date());
    const quotedToday = activeLeads.reduce((sum, lead) => {
        const updated = leadDateKey(lead.updatedAt);
        if (updated === today && typeof lead.estimatedValue === "number") {
            return sum + lead.estimatedValue;
        }
        return sum;
    }, 0);
    const depositsCollectedToday = activeLeads.reduce((sum, lead) => {
        const updated = leadDateKey(lead.updatedAt);
        if (lead.depositPaid === true && updated === today) {
            return sum + safeValue(lead.estimatedValue);
        }
        return sum;
    }, 0);
    const hotLeads = activeLeads.filter((lead) => lead.status === types_1.LeadStatus.HOT);
    const followUpsDueToday = activeLeads.filter((lead) => {
        const nextDate = leadDateKey(lead.nextActionDate);
        return nextDate === today;
    });
    const quotesToSend = activeLeads.filter((lead) => (lead.stage === types_1.LeadStage.CONTACTED || lead.stage === types_1.LeadStage.NEW) &&
        typeof lead.estimatedValue === "number");
    return {
        targets: {
            dailyRevenueTarget: DAILY_REVENUE_TARGET
        },
        totals: {
            quotedToday,
            depositsCollectedToday,
            openHotLeads: hotLeads.length
        },
        actions: {
            followUpsDueToday,
            hotLeads,
            quotesToSend
        },
        pace: {
            status: quotedToday >= DAILY_REVENUE_TARGET ? "ON_TRACK" : "BEHIND"
        }
    };
}
