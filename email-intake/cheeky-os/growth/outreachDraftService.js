"use strict";

/**
 * Growth outreach drafts — DRAFT ONLY, approval-gated. No LLM package: templated co-pilot copy.
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const taskQueue = require("../agent/taskQueue");
const approvalGateService = require("../approvals/approvalGateService");
const draftHelpers = require("../drafting/draftOrderHelpers");
const wf = require("../workflow/orderWorkflowRules");

const OUTREACH_ROOT = "outreach-drafts";

/** Global guard embedded in all growth AI-adjacent reasoning fields. */
const GROWTH_AI_GUARDRAIL =
  "Cheeky Tees growth co-pilot: DRAFTS ONLY — never send outreach, never bypass Patrick approval. " +
  "Prioritize professionalism, warmth, brand consistency, and long-term trust over aggressive sales.";

const TYPES = [
  "warm_reactivation",
  "estimate_followup",
  "repeat_customer",
  "corporate_intro",
  "school_outreach",
  "seasonal_promo",
  "overdue_estimate",
  "abandoned_quote",
  "deposit_reminder",
  "quote_follow_up",
  "ready_for_pickup",
  "order_update",
  "post_pickup_feedback",
  "stale_estimate_follow_up",
  "overdue_artwork_request",
];

function ensureDir() {
  taskQueue.ensureDirAndFiles();
  const root = path.join(taskQueue.DATA_DIR, OUTREACH_ROOT);
  if (!fs.existsSync(root)) fs.mkdirSync(root, { recursive: true });
  return root;
}

function newId() {
  try {
    if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  } catch (_e) {}
  return `og-${Date.now()}`;
}

function toneFor(tone, step) {
  const t = String(tone || "warm").toLowerCase();
  if (t === "direct") return step === 3 ? "Brief and direct — last nudge before parking." : "Direct but kind.";
  if (t === "playful") return "Light Cheeky warmth — still professional.";
  return "Warm, professional, local-shop voice.";
}

/** @returns {number} 0 friendly, 1 urgent, 2 final */
function toneLadderLevel(opts, step) {
  const o = opts && typeof opts === "object" ? opts : {};
  const raw = String(o.toneLadder || o.followUpEscalation || "").toLowerCase();
  let base = 0;
  if (raw === "urgent") base = 1;
  else if (raw === "final_reminder" || raw === "final") base = 2;
  if (String(o.tone || "").toLowerCase() === "direct" && base < 1) base = 1;
  return Math.min(2, base + (step >= 3 ? 1 : 0));
}

function urgencyPrefix(level) {
  if (level >= 2) return "Final friendly check-in: ";
  if (level >= 1) return "Time-sensitive: ";
  return "";
}

function ladderLabel(level) {
  if (level >= 2) return "final reminder";
  if (level >= 1) return "urgent";
  return "friendly";
}

/**
 * @returns {string}
 */
function buildAiReasoning(outreachType, ord, level) {
  /** @type {string} */
  let why = "Maintain transparent customer communication.";
  if (outreachType === "deposit_reminder") why = "Deposit still outstanding — production stays paused per policy until recorded.";
  else if (outreachType === "quote_follow_up") why = "Estimate needs a human answer so capacity + pricing stay honest.";
  else if (outreachType === "ready_for_pickup") why = "Pickup clarity reduces dock traffic and missed handoffs.";
  else if (outreachType === "order_update") why = "Operational update keeps expectations aligned without micromanaging the floor.";
  else if (outreachType === "post_pickup_feedback") why = "Relationship touch after delivery — never pushy.";
  else if (outreachType === "stale_estimate_follow_up") why = "Stale quote window — confirm interest before parking line items.";
  else if (outreachType === "overdue_artwork_request") why = "Art files bottleneck presses — customer prompt needs calm clarity.";

  /** @type {string} */
  let moneySignal = "unknown";
  if (ord) {
    if (wf.depositPaid(ord)) moneySignal = "Deposit recorded internally — any balance still governed by Square invoices.";
    else moneySignal = "Cash still gating next production moves — keep language focused on next simple step.";
  }

  const impact =
    level >= 2
      ? "High — slow reply risks schedule slip or stalled cash."
      : level >= 1
        ? "Medium — responsiveness protects schedule + trust."
        : "Low — rapport maintenance.";

  return `${GROWTH_AI_GUARDRAIL} WHY: ${why} Money signal (non-secret): ${moneySignal}. Expected impact if ignored: ${impact}. Tone ladder: ${ladderLabel(
    level
  )}.`;
}

function bodyFor(type, customerFirst, companyHint, step, sequenceMax, escalation) {
  const who = customerFirst || "there";
  const pre = step > 1 ? `Follow-up ${step}/${sequenceMax}: ` : "";
  const urg = urgencyPrefix(escalation);

  switch (type) {
    case "warm_reactivation":
      return (
        pre +
        `Hi ${who} — we've loved printing for ${companyHint}. If new swag is on your radar this quarter, want a fresh quote? No pressure — reply when timing feels right. (${GROWTH_AI_GUARDRAIL})`
      );
    case "estimate_followup":
      return (
        pre +
        `Hi ${who} — touching base on the estimate we shared. Still the right direction on qty and apparel? Happy to tweak pricing or timing. (${GROWTH_AI_GUARDRAIL})`
      );
    case "repeat_customer":
      return (
        pre +
        `Hi ${who} — thanks again for trusting Cheeky Tees. Ready for another easy run? Tell me the event or deadline and I'll line up options. (${GROWTH_AI_GUARDRAIL})`
      );
    case "corporate_intro":
      return (
        pre +
        `Hi ${who} — Cheeky Tees helps ${companyHint} teams ship clean merch without the chaos. If you need a reliable print partner, I can send a one-page capabilities note. (${GROWTH_AI_GUARDRAIL})`
      );
    case "school_outreach":
      return (
        pre +
        `Hi ${who} — gearing up for spirit wear or staff shirts? We bundle friendly pricing with fast proofs. Want a simple package option for your team? (${GROWTH_AI_GUARDRAIL})`
      );
    case "seasonal_promo":
      return (
        pre +
        `Hi ${who} — seasonal idea: refresh hoodies or tees while blank pricing is steady. I can draft SKU options with no commitment. (${GROWTH_AI_GUARDRAIL})`
      );
    case "overdue_estimate":
      return (
        pre +
        `Hi ${who} — checking in on the estimate before it goes stale. Still interested? If priorities shifted, just say the word and we'll park it. (${GROWTH_AI_GUARDRAIL})`
      );
    case "abandoned_quote":
      return (
        urg +
        pre +
        `Hi ${who} — noticed the quote cooled off. Anything we should fix (price, apparel, timeline)? One reply helps us prioritize you fairly. (${GROWTH_AI_GUARDRAIL})`
      );
    case "deposit_reminder":
      return (
        urg +
        pre +
        `Hi ${who} — gentle heads-up: we still show the deposit step open for ${companyHint}. Once that posts, we can keep your job on the calendar you expect. (${GROWTH_AI_GUARDRAIL})`
      );
    case "quote_follow_up":
      return (
        urg +
        pre +
        `Hi ${who} — circling on the estimate we sent for ${companyHint}. Still the right quantity and apparel direction? Happy to tweak scope. (${GROWTH_AI_GUARDRAIL})`
      );
    case "ready_for_pickup":
      return (
        urg +
        pre +
        `Hi ${who} — great news: your order for ${companyHint} is ready for pickup (or ship handoff if that was the plan). Reply with a pickup window that works. (${GROWTH_AI_GUARDRAIL})`
      );
    case "order_update":
      return (
        urg +
        pre +
        `Hi ${who} — quick production update on ${companyHint}: we're aligning blanks/press time; no action needed unless you have a date change. (${GROWTH_AI_GUARDRAIL})`
      );
    case "post_pickup_feedback":
      return (
        urg +
        pre +
        `Hi ${who} — hope the ${companyHint} shirts landed well. If anything needs a tweak, reply here and we'll route it through the right Cheeky specialist. (${GROWTH_AI_GUARDRAIL})`
      );
    case "stale_estimate_follow_up":
      return (
        urg +
        pre +
        `Hi ${who} — the estimate window is getting long in the tooth — still something you want us to keep warm? No pressure; a one-line reply helps us plan capacity fairly. (${GROWTH_AI_GUARDRAIL})`
      );
    case "overdue_artwork_request":
      return (
        urg +
        pre +
        `Hi ${who} — we need the art files or proof decision to keep ${companyHint} moving. If something is blocked on your side, tell us and we'll suggest the lightest next step. (${GROWTH_AI_GUARDRAIL})`
      );
    default:
      return urg + pre + `Hi ${who} — quick note from Cheeky Tees to see if we can help soon. (${GROWTH_AI_GUARDRAIL})`;
  }
}

/**
 * @param {object} opts
 */
async function generateOutreachDraft(opts) {
  const o = opts && typeof opts === "object" ? opts : {};
  const outreachType = String(o.outreachType || "estimate_followup").toLowerCase();
  if (TYPES.indexOf(outreachType) < 0) {
    return { ok: false, safeMessage: "Unknown outreach type." };
  }

  const orderId = o.orderId ? String(o.orderId) : null;
  let ord = null;
  if (orderId) ord = await draftHelpers.loadOrderById(orderId);

  const customer = String((ord && ord.customerName) || o.customer || "Customer").trim();
  const customerFirst = customer.split(/\s+/)[0] || customer;
  const companyHint = customer.length > 48 ? customer.slice(0, 45) + "…" : customer;
  const tone = o.tone || "warm";
  const sequenceMax = Math.min(3, Math.max(1, Number(o.sequenceSteps) || Number(o.sequenceMax) || 1));
  const startStep = Math.min(sequenceMax, Math.max(1, Number(o.sequenceStep) || 1));

  /** @type {object[]} */
  const steps = [];
  for (let s = startStep; s <= sequenceMax; s++) {
    const esc = toneLadderLevel(o, s);
    steps.push({
      sequenceStep: s,
      tone: `${toneFor(tone, s)} · ladder=${ladderLabel(esc)}`,
      subject:
        outreachType.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) +
        (sequenceMax > 1 ? ` (part ${s})` : "") +
        (esc >= 2 ? " — attention" : esc >= 1 ? " — time-sensitive" : ""),
      body: bodyFor(outreachType, customerFirst, companyHint, s, sequenceMax, esc),
    });
  }

  const id = `out-${newId()}`;
  const primary = steps[0];
  const primaryEsc = toneLadderLevel(o, primary.sequenceStep);
  const doc = {
    id,
    customer,
    outreachType,
    sequenceStep: primary.sequenceStep,
    sequenceSteps: steps,
    subject: primary.subject,
    body: primary.body,
    tone: primary.tone,
    estimatedOpportunity:
      typeof o.estimatedOpportunity === "number" ? o.estimatedOpportunity : null,
    aiReasoning: buildAiReasoning(outreachType, ord, primaryEsc),
    approvalRequired: true,
    generatedAt: new Date().toISOString(),
    status: "draft_pending_approval",
    orderIdSnapshot: ord ? ord.id : orderId,
  };

  const p = path.join(ensureDir(), `${id.replace(/[^a-zA-Z0-9-_]/g, "_")}.json`);
  const tmp = `${p}.tmp.${Date.now()}`;
  fs.writeFileSync(tmp, JSON.stringify(doc, null, 2), "utf8");
  fs.renameSync(tmp, p);

  const approval = approvalGateService.createApproval({
    actionType: "growth_outreach",
    orderId: orderId,
    customer,
    description: `Outreach draft (${outreachType}) — Patrick approves before any send.`,
    draftPayload: { path: p, previewId: id, outreachType },
    impactLevel: "high",
    requiresPatrick: true,
    moneyImpact: "customer_trust_and_pipeline",
    requestedBy: "outreachDraftService",
    aiExplanation: doc.aiReasoning,
  });

  return { ok: true, draft: doc, path: p, approval };
}

function listOutreachDrafts() {
  const root = ensureDir();
  let files = [];
  try {
    files = fs.readdirSync(root).filter((f) => f.endsWith(".json"));
  } catch (_e) {
    return [];
  }
  const out = [];
  files.forEach((f) => {
    try {
      const j = JSON.parse(fs.readFileSync(path.join(root, f), "utf8"));
      if (!j.status || j.status === "draft_pending_approval") {
        out.push({
          id: j.id,
          customer: j.customer,
          outreachType: j.outreachType,
          generatedAt: j.generatedAt,
          subject: j.subject,
        });
      }
    } catch (_e2) {}
  });
  out.sort((a, b) => String(b.generatedAt || "").localeCompare(String(a.generatedAt || "")));
  return out;
}

function getOutreachDraftById(id) {
  const root = ensureDir();
  let files = [];
  try {
    files = fs.readdirSync(root);
  } catch (_e) {
    return null;
  }
  for (let i = 0; i < files.length; i++) {
    try {
      const j = JSON.parse(fs.readFileSync(path.join(root, files[i]), "utf8"));
      if (j && j.id === id) return j;
    } catch (_e2) {}
  }
  return null;
}

module.exports = {
  generateOutreachDraft,
  listOutreachDrafts,
  getOutreachDraftById,
  TYPES,
  GROWTH_AI_GUARDRAIL,
};
