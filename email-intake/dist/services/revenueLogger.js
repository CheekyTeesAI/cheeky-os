"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.logRevenueEvent = logRevenueEvent;
function logRevenueEvent(type, orderId, detail) {
    console.log(`[REVENUE EVENT] ${type} → ${orderId} → ${detail}`);
}
