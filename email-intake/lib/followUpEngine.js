"use strict";

const { sendEmail } = require("./integrations/outlook");
const { getEstimates, updateFollowUpState } = require("./estimateStore");
const { logEvent } = require("./eventStore");
const { generateRevenueFollowUpTask } = require("./taskEngine");

const DEFAULT_TO = "customer.service@cheekyteesllc.com";

const STAGE_MESSAGES = {
  1: "Hey just checking in — want me to get this started for you?",
  2: "We can still hit your timeline if we move today.",
  3: "Last call before we archive this — let me know!",
};

/**
 * Hours from createdAt
 * @param {Record<string, unknown>} e
 */
function ageHoursFromCreated(e) {
  const t = Date.parse(String(e.createdAt || ""));
  if (Number.isNaN(t)) return 0;
  return Math.max(0, (Date.now() - t) / (1000 * 60 * 60));
}

/**
 * Open = not closed
 * @param {Record<string, unknown>} e
 */
function isOpenEstimate(e) {
  const s = String(e.status || "").toLowerCase();
  return s === "sent" || s === "viewed";
}

/**
 * @returns {Array<{ estimate: Record<string, unknown>; stage: number }>}
 */
function getFollowUpCandidates() {
  const out = [];
  const list = getEstimates();
  for (const e of list) {
    if (!isOpenEstimate(e)) continue;
    const age = ageHoursFromCreated(e);
    const level = Number(e.followUpLevel) || 0;
    if (level >= 3) continue;
    if (level === 0 && age >= 24) {
      out.push({ estimate: e, stage: 1 });
      continue;
    }
    if (level === 1 && age >= 72) {
      out.push({ estimate: e, stage: 2 });
      continue;
    }
    if (level === 2 && age >= 120) {
      out.push({ estimate: e, stage: 3 });
    }
  }
  return out;
}

/**
 * @param {Record<string, unknown>} estimate
 * @param {number} stage 1 | 2 | 3
 */
async function sendFollowUp(estimate, stage) {
  const st = Math.min(3, Math.max(1, stage));
  const body = STAGE_MESSAGES[/** @type {1|2|3} */ (st)] || STAGE_MESSAGES[1];
  const customer = String(estimate.customer || "Customer");
  const to = String(estimate.email || "").trim() || DEFAULT_TO;
  const subject = `[Cheeky] Follow-up — ${customer}`;

  try {
    const result = await sendEmail({
      to,
      subject,
      body: `${body}\n\n— Cheeky OS`,
    });
    const ok = result && result.success === true;
    const id = String(estimate.id || "");
    if (ok) {
      updateFollowUpState(id, st, new Date().toISOString());
      try {
        logEvent("follow_up_sent", {
          estimateId: id,
          stage: st,
          customer,
          mode: result && result.mode,
        });
      } catch (_) {}
      try {
        generateRevenueFollowUpTask(customer);
      } catch (_) {}
    } else {
      try {
        logEvent("follow_up_failed", {
          estimateId: id,
          stage: st,
          message: result && result.message,
        });
      } catch (_) {}
    }
    return result;
  } catch (err) {
    const e = err instanceof Error ? err : new Error(String(err));
    try {
      logEvent("follow_up_failed", {
        estimateId: estimate.id,
        stage: st,
        message: e.message,
      });
    } catch (_) {}
    return { success: false, message: e.message };
  }
}

/**
 * @returns {{ totalEstimates: number, openEstimates: number, followUpsDue: number, estimatedRevenue: number, pipelineValue: number }}
 */
function getCashMetrics() {
  const list = getEstimates();
  let openEstimates = 0;
  let estimatedRevenue = 0;
  let pipelineValue = 0;
  for (const e of list) {
    const amt = Number(e.amount) || 0;
    if (isOpenEstimate(e)) {
      openEstimates++;
      estimatedRevenue += amt;
      pipelineValue += amt;
    }
  }
  const followUpsDue = getFollowUpCandidates().length;
  return {
    totalEstimates: list.length,
    openEstimates,
    followUpsDue,
    estimatedRevenue,
    pipelineValue,
  };
}

const { runFollowUpCycle } = require("./leadFollowUpEngine");

module.exports = {
  getFollowUpCandidates,
  sendFollowUp,
  getCashMetrics,
  ageHoursFromCreated,
  runFollowUpCycle,
};
