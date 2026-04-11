/**
 * Bundle 26 — auto draft invoices from high-probability follow-ups (draft only).
 * Uses squareDraftInvoice.createDraftInvoice — same as POST /square/create-draft-invoice.
 */

const fs = require("fs");
const path = require("path");
const { getRevenueFollowups } = require("./revenueFollowups");
const { scoreFollowupOpportunities } = require("./followupScoringService");
const { evaluateInvoiceAutomation } = require("./invoiceAutomationService");
const { createDraftInvoice } = require("./squareDraftInvoice");
const { canRun } = require("./autopilotGuardService");
const { addException } = require("./exceptionQueueService");
const { recordLedgerEventSafe } = require("./actionLedgerService");

const INVOICE_STATE_FILE = path.join(
  __dirname,
  "..",
  "data",
  "invoice-auto-state.json"
);
const FOLLOWUP_STATE_FILE = path.join(
  __dirname,
  "..",
  "data",
  "followup-auto-state.json"
);

const MAX_CREATES_PER_RUN = 2;
const RECENT_AUTO_DRAFT_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * @param {unknown} iso
 * @returns {number}
 */
function parseTime(iso) {
  const t = new Date(iso || "").getTime();
  return Number.isFinite(t) ? t : 0;
}

/**
 * @param {unknown} raw
 * @returns {string}
 */
function normalizeE164(raw) {
  const s = String(raw || "").trim();
  if (!s) return "";
  if (s.startsWith("+")) return s;
  const d = s.replace(/\D/g, "");
  if (d.length === 10) return "+1" + d;
  if (d.length === 11 && d.startsWith("1")) return "+" + d;
  return s;
}

/**
 * @returns {Record<string, { lastSentAt?: string }>}
 */
function loadFollowupSmsStateByPhone() {
  try {
    const txt = fs.readFileSync(FOLLOWUP_STATE_FILE, "utf8");
    const j = JSON.parse(txt);
    if (j && j.byKey && typeof j.byKey === "object") return j.byKey;
  } catch (_) {}
  return {};
}

function loadInvoiceState() {
  try {
    const txt = fs.readFileSync(INVOICE_STATE_FILE, "utf8");
    const j = JSON.parse(txt);
    if (
      j &&
      typeof j === "object" &&
      j.byCustomerId &&
      typeof j.byCustomerId === "object"
    ) {
      return { byCustomerId: { ...j.byCustomerId } };
    }
  } catch (_) {}
  return { byCustomerId: {} };
}

/**
 * @param {{ byCustomerId: Record<string, { invoiceId?: string, createdAt?: string }> }} s
 */
function saveInvoiceState(s) {
  const dir = path.dirname(INVOICE_STATE_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(INVOICE_STATE_FILE, JSON.stringify(s, null, 2), "utf8");
}

/**
 * @param {string} customerId
 * @param {{ byCustomerId: Record<string, { invoiceId?: string, createdAt?: string }> }} state
 */
function isRecentAutoDraft(customerId, state) {
  const cid = String(customerId || "").trim();
  if (!cid) return false;
  const e = state.byCustomerId[cid];
  if (!e || !e.createdAt) return false;
  const t = new Date(e.createdAt).getTime();
  if (!Number.isFinite(t)) return false;
  return Date.now() - t < RECENT_AUTO_DRAFT_MS;
}

/**
 * Map scored priority to automation confidence (safety: executor only passes critical/high).
 * @param {string} priority
 */
function priorityToConfidence(priority) {
  const p = String(priority || "").toLowerCase();
  if (p === "critical" || p === "high") return "high";
  if (p === "medium") return "medium";
  return "low";
}

/**
 * @returns {Promise<{ created: number, skipped: number, errors: string[] }>}
 */
async function runInvoiceExecutor() {
  const out = { created: 0, skipped: 0, errors: [] };
  const gate = canRun("invoice_create");
  if (!gate.allowed) {
    out.errors.push(gate.reason);
    console.warn("[invoiceExecutor] blocked:", gate.reason);
    recordLedgerEventSafe({
      type: "invoice",
      action: "invoice_executor_blocked",
      status: "blocked",
      reason: String(gate.reason || ""),
    });
    const r = String(gate.reason || "").toLowerCase();
    addException({
      type: "automation",
      customerName: "",
      orderId: "",
      severity: r.includes("kill switch") ? "critical" : "high",
      reason: `Invoice automation blocked: ${gate.reason}`,
    });
    return out;
  }
  const state = loadInvoiceState();
  const smsByPhone = loadFollowupSmsStateByPhone();

  try {
    const rev = await getRevenueFollowups();
    const unpaid = rev.unpaidInvoices || [];
    const stale = rev.staleEstimates || [];

    /** @type {Map<string, { customerId?: string, createdAt?: string }>} */
    const metaById = new Map();
    for (const r of unpaid) {
      if (r && r.id) metaById.set(String(r.id), { customerId: r.customerId, createdAt: r.dueDate || "" });
    }
    for (const r of stale) {
      if (r && r.id)
        metaById.set(String(r.id), {
          customerId: r.customerId,
          createdAt: r.createdAt || "",
        });
    }

    const scored = scoreFollowupOpportunities(unpaid, stale);

    const candidates = scored.filter((row) => {
      const p = String(row.priority || "").toLowerCase();
      return p === "critical" || p === "high";
    });

    for (const row of candidates) {
      if (out.created >= MAX_CREATES_PER_RUN) break;

      const meta = metaById.get(row.id) || {};
      const customerId = String(meta.customerId || "").trim();
      const phoneKey = normalizeE164(row.phone);
      const smsTouch =
        phoneKey && smsByPhone[phoneKey] && smsByPhone[phoneKey].lastSentAt
          ? String(smsByPhone[phoneKey].lastSentAt)
          : "";
      const rowTouch = String(meta.createdAt || "").trim();
      const lastInteraction =
        [smsTouch, rowTouch]
          .map((s) => ({ s, t: parseTime(s) }))
          .sort((a, b) => b.t - a.t)[0]?.s || "";

      const hasExistingInvoice = row.type === "invoice";
      const alreadyDraftedRecently = isRecentAutoDraft(customerId, state);

      const confidence = priorityToConfidence(row.priority);
      const decision = evaluateInvoiceAutomation(
        {
          customerName: row.customerName,
          customerId,
          amount: row.amount,
          status: row.type || "",
          lastInteraction,
          confidence,
        },
        { hasExistingInvoice, alreadyDraftedRecently }
      );

      if (!decision.shouldCreate) {
        out.skipped++;
        recordLedgerEventSafe({
          type: "invoice",
          action: "draft_invoice_skipped",
          status: "skipped",
          customerName: String(row.customerName || ""),
          reason: String(decision.reason || "Automation decision skipped"),
        });
        continue;
      }

      const amt = Number(row.amount);
      const desc =
        String(row.customerName || "Custom order").trim().slice(0, 200) ||
        "Custom order";
      const inv = await createDraftInvoice({
        customerId,
        lineItems: [{ name: desc, quantity: 1, price: amt }],
      });

      if (!inv.success) {
        out.errors.push(String(inv.error || "create_draft_failed"));
        recordLedgerEventSafe({
          type: "invoice",
          action: "draft_invoice_failed",
          status: "blocked",
          customerName: String(row.customerName || ""),
          reason: String(inv.error || "create_draft_failed"),
        });
        break;
      }

      state.byCustomerId[customerId] = {
        invoiceId: String(inv.invoiceId || ""),
        createdAt: new Date().toISOString(),
      };
      saveInvoiceState(state);
      out.created++;
      recordLedgerEventSafe({
        type: "invoice",
        action: "draft_invoice_created",
        status: "success",
        customerName: String(row.customerName || ""),
        orderId: String(row.id || ""),
        reason: "Draft invoice created from automation",
        meta: { amount: Number(row.amount) || 0 },
      });
      console.log("[invoiceExecutor] draft created", {
        customerId,
        invoiceId: inv.invoiceId,
        runTotal: out.created,
      });
    }
  } catch (err) {
    out.errors.push(String(err && err.message ? err.message : err));
    recordLedgerEventSafe({
      type: "invoice",
      action: "invoice_executor_error",
      status: "blocked",
      reason: String(err && err.message ? err.message : err),
    });
  }

  return out;
}

module.exports = { runInvoiceExecutor, MAX_CREATES_PER_RUN };
