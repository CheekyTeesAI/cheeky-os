"use strict";

/**
 * Customer follow-up drafts — never sends; always creates high-impact approval.
 */

const fs = require("fs");
const path = require("path");

const wf = require("../workflow/orderWorkflowRules");
const taskQueue = require("../agent/taskQueue");
const approvalGateService = require("../approvals/approvalGateService");
const helpers = require("./draftOrderHelpers");

const SUBDIR = "follow-up";

const TYPES = ["deposit_reminder", "art_approval", "pickup_ready", "order_update", "estimate_followup"];

function draftsRoot() {
  taskQueue.ensureDirAndFiles();
  const root = path.join(taskQueue.DATA_DIR, "drafts", SUBDIR);
  if (!fs.existsSync(root)) fs.mkdirSync(root, { recursive: true });
  return root;
}

function anchorDate(o) {
  if (o.lastFollowupAt) return new Date(o.lastFollowupAt);
  return new Date(o.updatedAt || o.createdAt || Date.now());
}

function escalation(o) {
  const days = helpers.daysBetween(anchorDate(o), new Date());
  if (days >= 7) return { tier: "final_notice", tone: "final_notice", daysSinceTouch: days };
  if (days >= 3) return { tier: "urgent", tone: "urgent", daysSinceTouch: days };
  return { tier: "friendly", tone: "friendly", daysSinceTouch: days };
}

function openers(tone) {
  if (tone === "final_notice") return "Final friendly check-in:";
  if (tone === "urgent") return "Quick urgent follow-up:";
  return "Friendly check-in:";
}

function buildBody(type, o, esc) {
  const name = String(o.customerName || "there").split(" ")[0];
  const op = openers(esc.tone);
  if (type === "deposit_reminder") {
    return `${op} Hi ${name} — we still need the deposit on ${String(
      o.orderNumber || "your order"
    )} before we can secure production time. Reply when you are ready and we will resend the invoice link. (Day ${esc.daysSinceTouch} since last touch)`;
  }
  if (type === "art_approval") {
    return `${op} Hi ${name} — we need your thumbs-up on the latest proof for ${String(
      o.orderNumber || "your order"
    )} so Jeremy can prep screens. Let us know tweaks or approve when it looks good.`;
  }
  if (type === "pickup_ready") {
    return `${op} Hi ${name} — ${String(
      o.orderNumber || "your order"
    )} is boxed and ready for pickup. Let us know pickup time that works.`;
  }
  if (type === "estimate_followup") {
    return `${op} Hi ${name} — touching base on the estimate for ${String(
      o.orderNumber || "your project"
    )}. Still interested? We can adjust qty or apparel to fit.`;
  }
  return `${op} Hi ${name} — update on ${String(o.orderNumber || "your order")}: ${String(
    o.notes || "we are standing by for next steps."
  ).slice(0, 400)}`;
}

function draftFilePath(orderId, type) {
  const safe = `${String(orderId)}_${String(type)}`.replace(/[^a-zA-Z0-9-_]/g, "_");
  return path.join(draftsRoot(), `${safe}.json`);
}

function saveFollowUpDraft(doc) {
  const p = draftFilePath(doc.orderId, doc.followUpType);
  const tmp = `${p}.tmp.${Date.now()}`;
  fs.writeFileSync(tmp, JSON.stringify(doc, null, 2), "utf8");
  fs.renameSync(tmp, p);
  return p;
}

async function generateFollowUpDraft(orderId, type) {
  const t = String(type || "order_update").toLowerCase();
  if (TYPES.indexOf(t) < 0) {
    return { ok: false, safeMessage: `Unknown follow-up type. Use one of: ${TYPES.join(", ")}.` };
  }
  const o = await helpers.loadOrderById(orderId);
  if (!o) return { ok: false, safeMessage: "Order not found for follow-up draft." };

  const esc = escalation(o);
  const subjectLine =
    t === "deposit_reminder"
      ? "Deposit still open"
      : t === "art_approval"
        ? "Proof needs your OK"
        : t === "pickup_ready"
          ? "Order ready for pickup"
          : t === "estimate_followup"
            ? "Following up on estimate"
            : "Order update";

  const draft = {
    draftKind: "customer_follow_up",
    orderId: String(o.id),
    customer: String(o.customerName || ""),
    followUpType: t,
    channel: "draft_text_only_no_send",
    tone: esc.tone,
    daysSinceTouch: esc.daysSinceTouch,
    subject: subjectLine,
    bodyDraft: buildBody(t, o, esc),
    blockers:
      !wf.depositPaid(o) && t !== "deposit_reminder"
        ? ["Deposit still outstanding — acknowledge before promising ship dates."]
        : [],
    approvalRequired: true,
    generatedAt: new Date().toISOString(),
    status: "pending_review",
  };

  const p = saveFollowUpDraft(draft);

  const approval = approvalGateService.createApproval({
    actionType: "customer_message",
    orderId: String(o.id),
    customer: draft.customer,
    description: `${t.replace(/_/g, " ")} message draft (${esc.tone}) — review before any outbound send.`,
    draftPayload: { path: p, preview: draft },
    impactLevel: "high",
    requiresPatrick: true,
    moneyImpact: "customer_trust_and_revenue_at_risk",
    requestedBy: "follow_up_draft_service",
    aiExplanation:
      "High impact: customer-visible. Visibility -> draft -> Patrick approval -> trusted channel sends manually.",
  });

  return { ok: true, draft, path: p, approval };
}

function generateDepositReminder(orderId) {
  return generateFollowUpDraft(orderId, "deposit_reminder");
}

function generateArtApprovalRequest(orderId) {
  return generateFollowUpDraft(orderId, "art_approval");
}

function generatePickupReadyNotification(orderId) {
  return generateFollowUpDraft(orderId, "pickup_ready");
}

function getFollowUpDraft(orderId, type) {
  const p = draftFilePath(orderId, type || "order_update");
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch (_e) {
    return null;
  }
}

function listPendingFollowUpDrafts() {
  let files = [];
  try {
    files = fs.readdirSync(draftsRoot()).filter((f) => f.endsWith(".json"));
  } catch (_e) {
    return [];
  }
  const out = [];
  files.forEach((f) => {
    try {
      const raw = fs.readFileSync(path.join(draftsRoot(), f), "utf8");
      const j = JSON.parse(raw);
      if (!j.status || j.status === "pending_review")
        out.push({
          orderId: j.orderId,
          followUpType: j.followUpType,
          tone: j.tone,
          generatedAt: j.generatedAt,
        });
    } catch (_e) {}
  });
  return out;
}

module.exports = {
  generateDepositReminder,
  generateArtApprovalRequest,
  generatePickupReadyNotification,
  generateFollowUpDraft,
  listPendingFollowUpDrafts,
  getFollowUpDraft,
  TYPES,
};
