"use strict";

/**
 * Self-service intake — internal queue + approval only.
 * Does not quote, invoice, mutate production, or send messages.
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const taskQueue = require("../agent/taskQueue");
const approvalGateService = require("../approvals/approvalGateService");
const frictionLogService = require("../ops/frictionLogService");

const QUEUE_FILE = "intake-self-service-queue.json";

function queuePath() {
  taskQueue.ensureDirAndFiles();
  return path.join(taskQueue.DATA_DIR, QUEUE_FILE);
}

function readQueue() {
  const p = queuePath();
  if (!fs.existsSync(p))
    return { items: [], note: null };
  try {
    const j = JSON.parse(fs.readFileSync(p, "utf8"));
    return j && typeof j === "object" && Array.isArray(j.items) ? j : { items: [] };
  } catch (_e) {
    return { items: [], note: "recoverable_parse_error" };
  }
}

function writeQueue(doc) {
  const p = queuePath();
  const tmp = `${p}.tmp.${Date.now()}`;
  fs.writeFileSync(tmp, JSON.stringify(doc, null, 2), "utf8");
  fs.renameSync(tmp, p);
}

function newId() {
  try {
    if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  } catch (_e) {}
  return `int-${Date.now()}-${crypto.randomBytes(5).toString("hex")}`;
}

const PHASE5_NOTE =
  "Self-service submissions stay internal drafts — Patrick reviews queued items before quoting or outbound replies.";

/**
 * @param {object} raw
 */
function submitSelfServicePayload(raw) {
  const body = raw && typeof raw === "object" ? raw : {};

  const name = String(body.name || "").trim().slice(0, 160);
  const email = String(body.email || "").trim().toLowerCase().slice(0, 200);
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  if (!name || name.length < 2 || !email || !emailOk) {
    return { ok: false, safeMessage: "We need your name plus a readable email address so Cheeky can follow up privately." };
  }

  const item = {
    id: newId(),
    status: "pending_review",
    name,
    email,
    phone: String(body.phone || "").trim().slice(0, 40),
    organization: String(body.organization || "").trim().slice(0, 200),
    garmentType: String(body.garmentType || "").trim().slice(0, 120),
    quantityEstimate: String(body.quantityEstimate || body.quantity || "").trim().slice(0, 80),
    printMethodPreference: String(body.printMethodPreference || "").trim().slice(0, 120),
    designDescription: String(body.designDescription || "").trim().slice(0, 2500),
    dueDateCustomer: String(body.dueDate || "").trim().slice(0, 40),
    notes: String(body.notes || "").trim().slice(0, 2000),
    referenceImageInstructions: String(body.referenceImageInstructions || "").trim().slice(0, 1000),
    createdAt: new Date().toISOString(),
    source: "self_service_public_form",
  };

  const doc = readQueue();
  doc.items.unshift(item);
  doc.items = doc.items.slice(0, 500);
  writeQueue(doc);

  try {
    frictionLogService.appendEntry({
      area: "Self-service intake queue",
      description: `${name} submitted scope (${email}) — queued reference ${item.id}`,
      severity: "low",
      whoNoticed: "customer-intake-lite",
      suggestedFix: "Convert via normal intake playbook after Patrick reviews approval gate.",
    });
  } catch (_f) {}

  let approval = null;
  try {
    approval = approvalGateService.createApproval({
      actionType: "self_service_intake_review",
      customer: name,
      orderId: null,
      description: `Website intake (${item.id}): ${String(item.quantityEstimate || "")} · ${String(
        item.printMethodPreference || ""
      ).slice(0, 72)}.`,
      draftPayload: { intakeQueueId: item.id, emailDom: email.split("@")[1] || "" },
      impactLevel: "medium",
      moneyImpact: "pipeline_only",
      requiresPatrick: true,
      requestedBy: "selfServiceIntakeService",
      aiExplanation: PHASE5_NOTE,
    });
  } catch (_ap) {}

  const friendlyEta = "Most requests get a coordinator reply within about 1–2 business days; rush notes help us prioritize fairly.";
  const confirmationMessageCustomerFriendly =
    [
      item.id ? `Reference ${item.id}. ` : "",
      "Cheeky's team reviews this silently first — outbound reply only after internal approval gates.",
      " No payment happens inside this screen; invoices always come via Square/email when ready.",
      " ",
      friendlyEta,
    ].join("") ||
    "";

  return {
    ok: true,
    confirmationMessageCustomerFriendly: confirmationMessageCustomerFriendly.slice(0, 2800),
    estimatedReviewTimeline: friendlyEta,
    intakeReference: item.id,
    approvalQueued: !!approval,
    intakeItemSanitized: {
      id: item.id,
      status: item.status,
      garmentType: item.garmentType,
      quantityEstimate: item.quantityEstimate,
      dueDateCustomer: item.dueDateCustomer,
      createdAt: item.createdAt,
    },
  };
}

/** @returns {object[]} */
function listPendingIntake(limit) {
  const n = Math.min(120, Math.max(1, Number(limit) || 40));
  const doc = readQueue();
  const pending = doc.items.filter((x) => x && x.status === "pending_review");
  return pending.slice(0, n);
}

/** Operator snapshot */
function listQueueSnapshot(limit) {
  const doc = readQueue();
  const n = Math.min(200, Math.max(5, Number(limit) || 50));
  return doc.items.slice(0, n).map((row) => ({
    id: row.id,
    status: row.status,
    name: row.name,
    emailMasked:
      row.email &&
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)
        ? `${String(row.email).slice(0, 1)}⋯@${String(row.email).split("@")[1]}`
        : "pending_review",
    garmentType: row.garmentType,
    quantityEstimate: row.quantityEstimate,
    dueDateCustomer: row.dueDateCustomer,
    createdAt: row.createdAt,
  }));
}

module.exports = {
  submitSelfServicePayload,
  listPendingIntake,
  listQueueSnapshot,
  readQueue,
  PHASE5_NOTE,
};
