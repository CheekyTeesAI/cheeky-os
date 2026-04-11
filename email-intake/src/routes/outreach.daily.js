"use strict";

const fs = require("fs");
const path = require("path");
const { Router } = require("express");
const approvalQueue = require("../helpers/outreachApprovalQueue");
const { getNextActions } = require("../actions/outreach/getNextActions");
const salesOpsOutputs = require("../helpers/salesOpsOutputs");

const router = Router();

function dailyTimestampLocal() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
}

function internalPort() {
  return Number(process.env.PORT || 3000);
}

async function triggerOutreachCloseViaHttp() {
  const port = internalPort();
  const key = encodeURIComponent((process.env.API_KEY || "").trim());
  const url = `http://127.0.0.1:${port}/outreach/close?apikey=${key}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({})
  });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch (_e) {
    data = { raw: text };
  }
  if (!res.ok) {
    const errMsg =
      (data && data.error) ||
      (data && data.stage) ||
      `HTTP ${res.status}`;
    throw new Error(String(errMsg));
  }
  return data;
}

function normalizeOutreach(closeBody) {
  return {
    processed: Number(closeBody.processed) || 0,
    hotLeads: Number(closeBody.hotLeads) || 0,
    offersBuilt: Number(closeBody.offersBuilt) || 0,
    messagesGenerated: Number(closeBody.messagesGenerated) || 0,
    estimatesCreated: Number(closeBody.estimatesCreated) || 0,
    followUpsScheduled: Number(closeBody.followUpsScheduled) || 0
  };
}

function buildDailySummaryText(runAt, outreach, queue, nextActions) {
  const lines = [
    "CHEEKY OS DAILY SALES SUMMARY",
    `Run At: ${runAt}`,
    `Processed: ${outreach.processed}`,
    `Hot Leads: ${outreach.hotLeads}`,
    `Pending Approvals: ${queue.pending}`,
    `Approved: ${queue.approved}`,
    `Sent: ${queue.sent}`,
    `Failed: ${queue.failed}`,
    "",
    "NEXT ACTIONS:"
  ];
  nextActions.forEach((a, i) => {
    lines.push(`${i + 1}. ${a}`);
  });
  lines.push("");
  return lines.join("\n");
}

function writeDailyArtifacts(runAt, outreach, queue, nextActions) {
  const dir = salesOpsOutputs.dailyDir();
  fs.mkdirSync(dir, { recursive: true });
  const stem = `daily-summary-${dailyTimestampLocal()}`;
  const jsonPath = path.join(dir, `${stem}.json`);
  const txtPath = path.join(dir, `${stem}.txt`);
  const payload = { runAt, outreach, queue, nextActions };
  fs.writeFileSync(jsonPath, JSON.stringify(payload, null, 2), "utf8");
  fs.writeFileSync(
    txtPath,
    buildDailySummaryText(runAt, outreach, queue, nextActions),
    "utf8"
  );
}

router.post("/outreach/daily-run", async (_req, res) => {
  const runAt = new Date().toISOString();
  try {
    const closeBody = await triggerOutreachCloseViaHttp();
    const outreach = normalizeOutreach(closeBody);
    const queue = approvalQueue.getQueueCounts();
    const nextActions = getNextActions({
      processed: outreach.processed,
      hotLeads: outreach.hotLeads,
      queue
    });

    writeDailyArtifacts(runAt, outreach, queue, nextActions);

    return res.status(200).json({
      success: true,
      runAt,
      outreach,
      queue,
      nextActions
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(200).json({
      success: false,
      error: msg,
      runAt,
      outreach: {
        processed: 0,
        hotLeads: 0,
        offersBuilt: 0,
        messagesGenerated: 0,
        estimatesCreated: 0,
        followUpsScheduled: 0
      },
      queue: approvalQueue.getQueueCounts(),
      nextActions: []
    });
  }
});

router.get("/outreach/daily-last", (_req, res) => {
  try {
    const latest = salesOpsOutputs.getLatestDailySummaryJsonPath();
    if (!latest) {
      return res.status(200).json({
        success: false,
        error: "No daily summary found"
      });
    }
    const raw = fs.readFileSync(latest, "utf8");
    const data = JSON.parse(raw);
    return res.status(200).json({ success: true, ...data });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(200).json({
      success: false,
      error: msg
    });
  }
});

module.exports = router;
