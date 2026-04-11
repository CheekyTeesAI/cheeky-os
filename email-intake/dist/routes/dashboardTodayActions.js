"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const asyncHandler_1 = require("../utils/asyncHandler");
const todayService_1 = require("../services/todayService");
const safetyGuardService_1 = require("../services/safetyGuardService");
const router = (0, express_1.Router)();
router.get("/dashboard/today/actions", (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const q = req.query ?? {};
    const limitRaw = q.limit;
    const pageSizeRaw = q.pageSize;
    const requestedLimit = limitRaw !== undefined ? Number(limitRaw) : undefined;
    const pageSize = pageSizeRaw !== undefined ? Number(pageSizeRaw) : undefined;
    const gate = (0, safetyGuardService_1.evaluateOperationSafety)({
        operation: "dashboard_today_actions",
        requestedLimit: requestedLimit !== undefined && !Number.isNaN(requestedLimit)
            ? requestedLimit
            : undefined,
        pageSize: pageSize !== undefined && !Number.isNaN(pageSize) ? pageSize : undefined,
        requireExplicitLimit: false,
    });
    if (!gate.allowed) {
        res
            .status(400)
            .json({ success: false, error: gate.reason ?? "Not allowed" });
        return;
    }
    const actions = await (0, todayService_1.getTodayActions)();
    res.json({ success: true, ...actions });
}));
exports.default = router;
