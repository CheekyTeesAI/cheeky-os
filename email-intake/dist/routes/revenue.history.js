/**
 * Revenue history from replies/conversions logs.
 */
"use strict";
const fs = require("fs");
const { Router } = require("express");
const salesOpsOutputs = require("../helpers/salesOpsOutputs");
const env = require("../utils/routeEnvelope");
const router = Router();
function readList(path) {
    if (!fs.existsSync(path))
        return [];
    try {
        const raw = fs.readFileSync(path, "utf8");
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed.items) ? parsed.items : [];
    }
    catch (_e) {
        return [];
    }
}
router.get("/revenue/history", (_req, res) => {
    const stage = "revenue.history";
    const replies = readList(salesOpsOutputs.getRepliesLogPath());
    const conversions = readList(salesOpsOutputs.getConversionsLogPath());
    const estimatedValueTotal = conversions.reduce((acc, c) => acc + (Number(c.estimatedValue) || 0), 0);
    const latestReply = replies.length > 0 ? replies[replies.length - 1] : null;
    const latestConversion = conversions.length > 0 ? conversions[conversions.length - 1] : null;
    return res.status(200).json(env.ok(stage, {
        repliesLogged: replies.length,
        conversionsLogged: conversions.length,
        estimatedValueTotal,
        latestReply,
        latestConversion
    }));
});
module.exports = router;
