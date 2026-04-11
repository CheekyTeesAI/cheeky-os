"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const asyncHandler_1 = require("../utils/asyncHandler");
const router = (0, express_1.Router)();
router.get("/system/health", (0, asyncHandler_1.asyncHandler)(async (_req, res) => {
    res.json({
        status: "ok",
        uptime: process.uptime(),
        timestamp: new Date(),
        memory: process.memoryUsage(),
    });
}));
exports.default = router;
