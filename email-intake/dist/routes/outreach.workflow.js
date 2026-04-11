"use strict";
const { Router } = require("express");
const approvalQueue = require("../helpers/outreachApprovalQueue");
const router = Router();
const ALLOWED_FILTER = new Set([
    "pending",
    "pending_followup",
    "approved",
    "rejected",
    "sent",
    "failed"
]);
router.get("/outreach/queue", (req, res) => {
    try {
        const st = req.query.status;
        const filter = typeof st === "string" && ALLOWED_FILTER.has(st) ? st : undefined;
        const items = approvalQueue.getItems(filter);
        return res.status(200).json({
            success: true,
            count: items.length,
            items
        });
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return res.status(200).json({
            success: false,
            error: msg,
            count: 0,
            items: []
        });
    }
});
router.post("/outreach/queue/update", (req, res) => {
    try {
        const { id, status } = req.body || {};
        if (!id || !status) {
            return res.status(200).json({
                success: false,
                error: "id and status required"
            });
        }
        if (status !== "approved" && status !== "rejected") {
            return res.status(200).json({
                success: false,
                error: "Invalid status"
            });
        }
        const item = approvalQueue.updateItem(id, status);
        if (!item) {
            return res.status(200).json({ success: false, error: "Item not found" });
        }
        return res.status(200).json({ success: true, item });
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return res.status(200).json({ success: false, error: msg });
    }
});
router.post("/outreach/resend-failed", async (_req, res) => {
    try {
        const out = await approvalQueue.processFailedResend();
        return res.status(200).json(out);
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return res.status(200).json({ success: false, error: msg });
    }
});
module.exports = router;
