"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const intake_engine_1 = require("../engines/intake.engine");
const auth_1 = require("../middleware/auth");
const errors_1 = require("../utils/errors");
const logger_1 = require("../utils/logger");
const router = (0, express_1.Router)();
const SAMPLE_EMAIL_TEXT = "I need 12 shirts at $20 each for Test Company";
router.post("/cheeky/test/email", async (req, res) => {
    try {
        const provided = (0, auth_1.readProvidedApiKey)(req);
        const expected = (0, auth_1.readExpectedApiKey)();
        if (!provided || provided !== expected) {
            res.status(401).json((0, errors_1.errorResponse)("AUTH", "Invalid API key"));
            return;
        }
        const notifyTo = (typeof req.body?.notifyEmail === "string" && req.body.notifyEmail.trim()) ||
            (process.env.INTAKE_NOTIFY_EMAIL || "").trim() ||
            "customer@example.com";
        logger_1.logger.info("[TEST EMAIL] running intake with sample text");
        const result = await (0, intake_engine_1.runIntakeFromEmailText)(SAMPLE_EMAIL_TEXT, notifyTo);
        res.json(result);
    }
    catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        res.status(500).json((0, errors_1.errorResponse)("INTAKE_TEST", message));
    }
});
exports.default = router;
