/**
 * Quick input route: parse lead text, persist manual customers, score/message/campaign, queue, and trigger outreach run.
 */
"use strict";

const { Router } = require("express");
const { db } = require("../db/client");
const approvalQueue = require("../helpers/outreachApprovalQueue");
const { upsertManualMany, readManual, dedupeByEmail } = require("../helpers/manualCustomersStore");
const { scoreLead } = require("../actions/revenue/leadScorer");
const { assignCampaignType } = require("../actions/revenue/campaignBuilder");
const { buildMessage } = require("../actions/revenue/messageBuilder");
const { internalHttpCall } = require("../utils/internalHttpCall");
const { logAudit } = require("../utils/auditLogger");
const env = require("../utils/routeEnvelope");

const router = Router();

function parseLine(line) {
  const t = String(line || "").trim();
  if (!t) return null;
  const parts = t.split(/\s+/);
  const email = parts.find((p) => p.includes("@")) || "";
  if (!email) return null;
  const nums = parts.filter((p) => /^\d+(\.\d+)?$/.test(p)).map(Number);
  const lastOrderDaysAgo = nums.length > 0 ? nums[0] : 30;
  const totalSpent = nums.length > 1 ? nums[1] : 0;
  const name = parts.slice(0, Math.max(1, parts.indexOf(email))).join(" ") || email.split("@")[0];
  return {
    id: `manual_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    name,
    email,
    lastOrderDaysAgo,
    totalSpent,
    source: "manual_quick_add",
    createdAt: new Date().toISOString()
  };
}

router.post("/customers/quick-add", async (req, res) => {
  const stage = "customers.quick-add";
  try {
    const text = String((req.body && (req.body.text || req.body.leads)) || "");
    const lines = text.split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
    const parsed = lines.map(parseLine).filter(Boolean);
    if (parsed.length === 0) {
      return res.status(200).json(env.fail(stage, "NO_VALID_LEADS", { parsed: 0 }));
    }

    const manual = upsertManualMany(parsed);
    let dbCustomers = [];
    try {
      dbCustomers = await db.customer.findMany({ orderBy: { createdAt: "desc" }, take: 200 });
    } catch (_e) {
      dbCustomers = [];
    }

    const merged = dedupeByEmail([...(manual || []), ...(dbCustomers || [])]);
    const queueMessages = parsed.map((c) => {
      const scored = scoreLead(c);
      const campaignType = assignCampaignType(scored.score, c.lastOrderDaysAgo);
      const msg = buildMessage(c, scored.tier, campaignType);
      return {
        customerId: c.id,
        to: c.email,
        subject: msg.subject,
        text: msg.text,
        campaignType,
        leadTier: scored.tier,
        leadScore: scored.score
      };
    });

    approvalQueue.appendFromMessages(queueMessages);
    const outreachRun = await internalHttpCall("/outreach/close", { method: "POST" });
    logAudit("customers.quick-add", { parsed: parsed.length, mergedCount: merged.length });

    return res.status(200).json(
      env.ok(stage, {
        parsedCount: parsed.length,
        manualCount: readManual().length,
        mergedCustomerCount: merged.length,
        queuedCount: queueMessages.length,
        outreachRun
      })
    );
  } catch (err) {
    return res.status(200).json(env.fail(stage, err));
  }
});

module.exports = router;
