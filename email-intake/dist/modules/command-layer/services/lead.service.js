"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createLead = createLead;
exports.getAllLeads = getAllLeads;
exports.getActiveLeads = getActiveLeads;
exports.updateLead = updateLead;
const types_1 = require("../models/types");
const validators_1 = require("../utils/validators");
const leads = [];
function createLead(data) {
    const validation = (0, validators_1.validateLeadInput)(data);
    if (!validation.isValid) {
        throw new Error(validation.errors.join(", "));
    }
    const input = (typeof data === "object" && data !== null
        ? data
        : {});
    const now = new Date().toISOString();
    const lead = {
        id: `lead_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
        name: String(input.name || "").trim(),
        company: input.company,
        phone: input.phone,
        email: input.email,
        source: input.source,
        orderType: input.orderType,
        estimatedValue: input.estimatedValue,
        stage: input.stage ?? types_1.LeadStage.NEW,
        nextAction: input.nextAction,
        nextActionDate: input.nextActionDate,
        status: input.status,
        depositPaid: input.depositPaid,
        notes: input.notes,
        createdAt: now,
        updatedAt: now
    };
    leads.push(lead);
    return lead;
}
function getAllLeads() {
    return leads;
}
function getActiveLeads() {
    return leads.filter((lead) => lead.stage !== types_1.LeadStage.WON && lead.stage !== types_1.LeadStage.LOST);
}
function updateLead(id, updates) {
    const idx = leads.findIndex((lead) => lead.id === id);
    if (idx === -1) {
        throw new Error("Lead not found");
    }
    const current = leads[idx];
    const updated = {
        ...current,
        ...updates,
        id: current.id,
        updatedAt: new Date().toISOString()
    };
    leads[idx] = updated;
    return updated;
}
