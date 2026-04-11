"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const dashboardService_1 = require("../services/dashboardService");
const router = (0, express_1.Router)();
router.get("/api/dashboard/today", async (_req, res) => {
    try {
        const result = await (0, dashboardService_1.getTodayDashboard)();
        res.json(result);
    }
    catch (err) {
        const message = err instanceof Error ? err.message : "Failed to load dashboard";
        res.status(500).json({ success: false, error: message });
    }
});
exports.default = router;
