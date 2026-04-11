"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateLeadInput = validateLeadInput;
exports.validateActivityInput = validateActivityInput;
const types_1 = require("../models/types");
function asRecord(data) {
    return typeof data === "object" && data !== null ? data : {};
}
function validateLeadInput(data) {
    const input = asRecord(data);
    const errors = [];
    const name = input.name;
    if (typeof name !== "string" || name.trim() === "") {
        errors.push("name is required");
    }
    if (input.estimatedValue !== undefined &&
        typeof input.estimatedValue !== "number") {
        errors.push("estimatedValue must be a number");
    }
    if (input.stage !== undefined &&
        !Object.values(types_1.LeadStage).includes(String(input.stage))) {
        errors.push("stage must be a valid LeadStage");
    }
    return {
        isValid: errors.length === 0,
        errors
    };
}
function validateActivityInput(data) {
    const input = asRecord(data);
    const errors = [];
    const leadId = input.leadId;
    if (typeof leadId !== "string" || leadId.trim() === "") {
        errors.push("leadId is required");
    }
    const activityType = input.activityType;
    if (typeof activityType !== "string" ||
        !Object.values(types_1.ActivityType).includes(activityType)) {
        errors.push("activityType must be a valid ActivityType");
    }
    return {
        isValid: errors.length === 0,
        errors
    };
}
