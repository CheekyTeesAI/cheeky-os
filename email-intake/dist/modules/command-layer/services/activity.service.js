"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.logActivity = logActivity;
exports.getActivitiesByLead = getActivitiesByLead;
const validators_1 = require("../utils/validators");
const activities = [];
function logActivity(data) {
    const validation = (0, validators_1.validateActivityInput)(data);
    if (!validation.isValid) {
        throw new Error(validation.errors.join(", "));
    }
    const input = (typeof data === "object" && data !== null
        ? data
        : {});
    const activity = {
        id: `act_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
        leadId: String(input.leadId || "").trim(),
        activityType: input.activityType,
        summary: String(input.summary || ""),
        outcome: input.outcome,
        nextAction: input.nextAction,
        nextActionDate: input.nextActionDate,
        createdAt: new Date().toISOString()
    };
    activities.push(activity);
    return activity;
}
function getActivitiesByLead(leadId) {
    return activities.filter((activity) => activity.leadId === leadId);
}
