"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const operatorService_1 = require("../services/operatorService");
const revenueLogger_1 = require("../services/revenueLogger");
const router = (0, express_1.Router)();
function safeJson(res, fn) {
    return fn()
        .then((data) => {
        res.status(200).json(data);
    })
        .catch((err) => {
        console.error("[operatorLayer]", err);
        res.status(200).json({
            error: err instanceof Error ? err.message : "failed",
        });
    });
}
router.get("/print-queue", (_req, res) => {
    void safeJson(res, () => (0, operatorService_1.getDailyPrintQueue)());
});
router.get("/follow-ups", (_req, res) => {
    void safeJson(res, () => (0, operatorService_1.getFollowUpPriority)());
});
router.get("/hot-unpaid", (_req, res) => {
    void safeJson(res, () => (0, operatorService_1.getHotUnpaidOrders)());
});
router.get("/orders-today", (_req, res) => {
    void safeJson(res, () => (0, operatorService_1.getOrdersCreatedToday)());
});
router.get("/next-actions", (_req, res) => {
    (0, revenueLogger_1.logRevenueEvent)("OPERATOR_NEXT_ACTIONS_REQUESTED", "operator", "GET");
    void safeJson(res, () => (0, operatorService_1.getNextBestActions)());
});
router.get("/briefing", (_req, res) => {
    (0, revenueLogger_1.logRevenueEvent)("OPERATOR_BRIEFING_REQUESTED", "operator", "GET");
    void safeJson(res, () => (0, operatorService_1.getOperatorBriefing)());
});
exports.default = router;
