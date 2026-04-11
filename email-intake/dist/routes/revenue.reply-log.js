/**
 * Revenue reply and conversion logging routes.
 */
"use strict";
const fs = require("fs");
const { Router } = require("express");
const salesOpsOutputs = require("../helpers/salesOpsOutputs");
const { logAudit } = require("../utils/auditLogger");
const env = require("../utils/routeEnvelope");
const router = Router();
function ensureRevenueDir() {
    fs.mkdirSync(salesOpsOutputs.revenueDir(), { recursive: true });
}
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
function writeList(path, items) {
    fs.writeFileSync(path, JSON.stringify({ updatedAt: new Date().toISOString(), items }, null, 2), "utf8");
}
router.post("/revenue/log-reply", (req, res) => {
    const stage = "revenue.log-reply";
    try {
        const customerId = String((req.body && req.body.customerId) || "").trim();
        const note = String((req.body && req.body.note) || "").trim();
        if (!customerId)
            return res.status(200).json(env.fail(stage, "customerId required"));
        ensureRevenueDir();
        const p = salesOpsOutputs.getRepliesLogPath();
        const items = readList(p);
        items.push({ id: `reply_${Date.now()}`, customerId, note, createdAt: new Date().toISOString() });
        writeList(p, items);
        logAudit(stage, { customerId });
        return res.status(200).json(env.ok(stage, { logged: true }));
    }
    catch (err) {
        return res.status(200).json(env.fail(stage, err));
    }
});
router.post("/revenue/log-conversion", (req, res) => {
    const stage = "revenue.log-conversion";
    try {
        const customerId = String((req.body && req.body.customerId) || "").trim();
        const note = String((req.body && req.body.note) || "").trim();
        const estimatedValue = Number((req.body && req.body.estimatedValue) || 0);
        if (!customerId)
            return res.status(200).json(env.fail(stage, "customerId required"));
        ensureRevenueDir();
        const p = salesOpsOutputs.getConversionsLogPath();
        const items = readList(p);
        items.push({ id: `conv_${Date.now()}`, customerId, note, estimatedValue: Number.isFinite(estimatedValue) ? estimatedValue : 0, createdAt: new Date().toISOString() });
        writeList(p, items);
        logAudit(stage, { customerId, estimatedValue });
        return res.status(200).json(env.ok(stage, { logged: true }));
    }
    catch (err) {
        return res.status(200).json(env.fail(stage, err));
    }
});
module.exports = router;
