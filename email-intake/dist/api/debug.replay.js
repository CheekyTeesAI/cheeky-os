"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const brain_1 = require("../core/brain");
const gatekeeper_1 = require("../core/gatekeeper");
const router_1 = require("../core/router");
const store_1 = require("../debug/store");
const auth_1 = require("../middleware/auth");
const logger_1 = require("../utils/logger");
const router = (0, express_1.Router)();
/**
 * Re-runs the last stored `input` through the manual voice pipeline (brain → gatekeeper → router → sales).
 * Does not re-send intake confirmation email.
 */
router.post("/cheeky/debug/replay", async (req, res) => {
    const provided = (0, auth_1.readProvidedApiKey)(req);
    const expected = (0, auth_1.readExpectedApiKey)();
    if (!provided || provided !== expected) {
        res.status(401).json({
            ok: false,
            success: false,
            stage: "auth",
            error: "Invalid API key"
        });
        return;
    }
    const prev = (0, store_1.getLastRun)();
    if (!prev) {
        res.status(400).json({ ok: false, error: "No last run to replay" });
        return;
    }
    const text = prev.input;
    try {
        const brainOut = await (0, brain_1.brain)(text);
        logger_1.stepLog.brain(`replay intent=${brainOut.intent} confidence=${brainOut.confidence}`);
        const gk = (0, gatekeeper_1.gatekeeper)(brainOut);
        if (gk.ok === false) {
            logger_1.stepLog.gatekeeper(`replay blocked: ${gk.error}`);
            const output = {
                ok: false,
                success: false,
                stage: gk.stage,
                error: gk.error
            };
            (0, store_1.setLastRun)({ input: text, output, timestamp: Date.now() });
            res.status(400).json(output);
            return;
        }
        logger_1.stepLog.gatekeeper("replay passed");
        logger_1.stepLog.router("replay dispatch CREATE_INVOICE");
        const routed = await (0, router_1.route)(brainOut.intent, gk.payload);
        logger_1.stepLog.engine(`replay invoiceId=${routed.invoiceId} status=${routed.status}`);
        const output = { ...routed, confidence: brainOut.confidence };
        (0, store_1.setLastRun)({ input: text, output, timestamp: Date.now() });
        res.json(output);
    }
    catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        const output = { ok: false, stage: "PIPELINE", error: message };
        (0, store_1.setLastRun)({ input: text, output, timestamp: Date.now() });
        res.status(500).json(output);
    }
});
exports.default = router;
