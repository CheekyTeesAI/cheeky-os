/**
 * Bundle 31 — closed-loop sales operator (orchestration only; no auto-invoice / no extra sends).
 */

const fs = require("fs");
const path = require("path");
const { runFollowupExecutor } = require("./followupExecutorService");
const { interpretCustomerResponse } = require("./responseInterpretationService");
const { buildQueuedActionFromInterpretation } = require("./nextStepTriggerService");
const { readRecentEntries } = require("../routes/responses");

const LAST_RUN_FILE = path.join(
  __dirname,
  "..",
  "data",
  "sales-operator-last-run.json"
);

const MAX_RESPONSES_PER_CYCLE = 12;

/**
 * @param {string} s
 */
function normKey(s) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

/**
 * @returns {{ at?: string, cycleSummary?: object, events?: string[] } | null}
 */
function readLastOperatorRun() {
  try {
    const txt = fs.readFileSync(LAST_RUN_FILE, "utf8");
    const j = JSON.parse(txt);
    if (j && typeof j === "object") return j;
  } catch (_) {}
  return null;
}

/**
 * @param {{ at: string, cycleSummary: object, events: string[] }} payload
 */
function writeLastOperatorRun(payload) {
  const dir = path.dirname(LAST_RUN_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(LAST_RUN_FILE, JSON.stringify(payload, null, 2), "utf8");
}

/**
 * @param {{ responses?: Array<{ customerName?: string, message?: string, orderId?: string }> }} [options]
 * @returns {Promise<{ cycleSummary: object, events: string[] }>}
 */
async function runSalesOperatorCycle(options) {
  const opt = options && typeof options === "object" ? options : {};
  /** @type {{ followupsSent: number, responsesProcessed: number, invoicesPrepared: number, queuedActions: number }} */
  const cycleSummary = {
    followupsSent: 0,
    responsesProcessed: 0,
    invoicesPrepared: 0,
    queuedActions: 0,
  };
  /** @type {string[]} */
  const events = [];

  const fx = await runFollowupExecutor();
  cycleSummary.followupsSent = Math.max(0, Math.floor(Number(fx.sent) || 0));

  if (cycleSummary.followupsSent > 0) {
    events.push(
      `Follow-up cycle: ${cycleSummary.followupsSent} SMS sent (executor cap respected)`
    );
  } else {
    events.push(
      "Follow-up cycle: no sends (skipped, limits, empty queue, or errors)"
    );
  }
  if (fx.errors && fx.errors.length) {
    const e0 = String(fx.errors[0] || "").trim();
    if (e0) events.push(`Follow-up error: ${e0.slice(0, 120)}`);
  }

  /** @type {{ customerName: string, message: string, orderId: string }[]} */
  let responseItems = [];

  const payloadList = Array.isArray(opt.responses) ? opt.responses : [];
  let fromPayload = false;
  for (const r of payloadList) {
    if (!r || typeof r !== "object") continue;
    const customerName = String(
      /** @type {{ customerName?: string }} */ (r).customerName != null
        ? /** @type {{ customerName?: string }} */ (r).customerName
        : ""
    ).trim();
    const message = String(
      /** @type {{ message?: string }} */ (r).message != null
        ? /** @type {{ message?: string }} */ (r).message
        : ""
    ).trim();
    const orderId = String(
      /** @type {{ orderId?: string }} */ (r).orderId != null
        ? /** @type {{ orderId?: string }} */ (r).orderId
        : ""
    ).trim();
    if (customerName && message) {
      responseItems.push({ customerName, message, orderId });
      fromPayload = true;
    }
  }

  if (!fromPayload) {
    const recent = readRecentEntries().entries || [];
    for (const row of recent) {
      if (!row || typeof row !== "object") continue;
      const customerName = String(
        /** @type {{ customerName?: string }} */ (row).customerName || ""
      ).trim();
      const message = String(
        /** @type {{ messagePreview?: string, message?: string }} */ (row)
          .messagePreview ||
          /** @type {{ message?: string }} */ (row).message ||
          ""
      ).trim();
      const orderId = String(
        /** @type {{ orderId?: string }} */ (row).orderId || ""
      ).trim();
      if (customerName && message) {
        responseItems.push({ customerName, message, orderId });
      }
    }
  }

  const seen = new Set();
  let processed = 0;

  for (const item of responseItems) {
    if (processed >= MAX_RESPONSES_PER_CYCLE) break;
    const dedupeKey = `${normKey(item.customerName)}|${item.message.slice(0, 240)}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    const interpretation = interpretCustomerResponse({
      customerName: item.customerName,
      message: item.message,
    });
    const queuedAction = buildQueuedActionFromInterpretation({
      customerName: item.customerName,
      orderId: item.orderId,
      interpretation,
    });

    cycleSummary.responsesProcessed++;
    processed++;

    events.push(
      `Detected ${interpretation.intent} from ${item.customerName}`
    );

    if (!queuedAction.shouldQueue) {
      events.push(`Manual review: ${item.customerName}`);
      continue;
    }

    cycleSummary.queuedActions++;

    if (queuedAction.actionType === "invoice") {
      cycleSummary.invoicesPrepared++;
      events.push(`Queued invoice action for ${item.customerName}`);
    } else if (queuedAction.actionType === "followup") {
      events.push(`Marked follow-up for next cycle: ${item.customerName}`);
    } else if (queuedAction.actionType === "review") {
      events.push(`Flagged for manual review: ${item.customerName}`);
    } else if (queuedAction.actionType === "clarify") {
      events.push(`Clarification needed: ${item.customerName}`);
    } else if (queuedAction.actionType === "later_followup") {
      events.push(`Later follow-up: ${item.customerName}`);
    } else {
      events.push(`Queued next step: ${item.customerName}`);
    }
  }

  const out = { cycleSummary, events };
  writeLastOperatorRun({
    at: new Date().toISOString(),
    cycleSummary: out.cycleSummary,
    events: out.events,
  });
  return out;
}

module.exports = {
  runSalesOperatorCycle,
  readLastOperatorRun,
};
