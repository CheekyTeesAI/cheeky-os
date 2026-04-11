/**
 * Bundle 37 — GET /cash/priorities (ranked cash-first opportunities).
 */

const { Router } = require("express");
const { buildSalesLoop } = require("../services/salesLoopService");
const { getAutoFollowupsResponse } = require("../services/autoFollowupsService");
const { collectAutomationActions } = require("../services/automationActionsService");
const { getRevenueFollowups } = require("../services/revenueFollowups");
const { scoreOpportunity } = require("../services/opportunityScoringService");
const { scoreDepositOpportunity } = require("../services/depositPriorityService");
const { getFounderDashboardPayload } = require("../services/founderTodayService");
const {
  evaluatePaymentGate,
  captureOrderToGateInput,
} = require("../services/paymentGateService");
const { getPrisma } = require("../marketing/prisma-client");
const {
  readRecentEntries,
  readRecentAutoInvoiceEntries,
} = require("./responses");

const router = Router();

function normName(s) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

/**
 * @param {{ unpaidInvoices?: object[], staleEstimates?: object[] }} rev
 * @returns {Map<string, { phone: string, email: string, customerId: string, paymentStatus: string }>}
 */
function metaByCustomerName(rev) {
  /** @type {Map<string, { phone: string, email: string, customerId: string, paymentStatus: string }>} */
  const m = new Map();
  const rows = [
    ...(Array.isArray(rev.unpaidInvoices) ? rev.unpaidInvoices : []),
    ...(Array.isArray(rev.staleEstimates) ? rev.staleEstimates : []),
  ];
  for (const r of rows) {
    if (!r || typeof r !== "object") continue;
    const cn = normName(/** @type {{ customerName?: string }} */ (r).customerName);
    if (!cn) continue;
    const phone = String(
      /** @type {{ phone?: string }} */ (r).phone || ""
    ).trim();
    const email = String(
      /** @type {{ email?: string }} */ (r).email || ""
    ).trim();
    const customerId = String(
      /** @type {{ customerId?: string }} */ (r).customerId || ""
    ).trim();
    const pay = String(
      /** @type {{ paymentStatus?: string, status?: string }} */ (r).paymentStatus ||
        /** @type {{ status?: string }} */ (r).status ||
        ""
    ).trim();
    const prev = m.get(cn);
    if (!prev) {
      m.set(cn, { phone, email, customerId, paymentStatus: pay });
    } else {
      m.set(cn, {
        phone: prev.phone || phone,
        email: prev.email || email,
        customerId: prev.customerId || customerId,
        paymentStatus: prev.paymentStatus || pay,
      });
    }
  }
  return m;
}

/**
 * @returns {Map<string, string>}
 */
function pricingStatusByName() {
  /** @type {Map<string, string>} */
  const m = new Map();
  try {
    const { entries } = readRecentAutoInvoiceEntries();
    for (const e of entries) {
      if (!e || typeof e !== "object") continue;
      const k = normName(/** @type {{ customerName?: string }} */ (e).customerName);
      if (!k) continue;
      const sl = String(
        /** @type {{ safetyLevel?: string }} */ (e).safetyLevel || "clear"
      ).toLowerCase();
      if (!m.has(k)) {
        if (sl === "review") m.set(k, "review");
        else if (sl === "blocked") m.set(k, "blocked");
        else m.set(k, "clear");
      }
    }
  } catch (_) {}
  return m;
}

/**
 * @returns {Promise<{ opportunities: object[], summary: object }>}
 */
async function buildCashPrioritiesPayload() {
  const summary = { critical: 0, high: 0, medium: 0, low: 0 };
  /** @type {object[]} */
  const rawInputs = [];

  let rev = { unpaidInvoices: [], staleEstimates: [] };
  try {
    rev = await getRevenueFollowups();
  } catch (_) {
    rev = { unpaidInvoices: [], staleEstimates: [] };
  }
  const nameMeta = metaByCustomerName(rev);
  const priceNames = pricingStatusByName();

  let loop = { candidates: [] };
  try {
    loop = await buildSalesLoop();
  } catch (_) {
    loop = { candidates: [] };
  }

  for (const c of loop.candidates || []) {
    if (rawInputs.length >= 25) break;
    if (!c || typeof c !== "object") continue;
    const cn = String(/** @type {{ customerName?: string }} */ (c).customerName || "").trim();
    const nk = normName(cn);
    const meta = nameMeta.get(nk) || {
      phone: "",
      email: "",
      customerId: "",
      paymentStatus: "",
    };
    rawInputs.push({
      customerName: cn,
      customerId: String(/** @type {{ customerId?: string }} */ (c).customerId || meta.customerId || "").trim(),
      phone: String(/** @type {{ phone?: string }} */ (c).phone || meta.phone || "").trim(),
      email: String(/** @type {{ email?: string }} */ (c).email || meta.email || "").trim(),
      amount: Number(/** @type {{ amount?: unknown }} */ (c).amount) || 0,
      daysOld: Number(/** @type {{ daysOld?: unknown }} */ (c).daysOld) || 0,
      priority: String(/** @type {{ priority?: string }} */ (c).priority || ""),
      messageReady: !!/** @type {{ messageReady?: boolean }} */ (c).messageReady,
      invoiceReady: !!/** @type {{ invoiceReady?: boolean }} */ (c).invoiceReady,
      pricingStatus: priceNames.get(nk) || "clear",
      paymentStatus: meta.paymentStatus || "",
      recommendedAction: String(
        /** @type {{ recommendedAction?: string }} */ (c).recommendedAction || "manual_review"
      ),
      sourceType: "followup",
    });
  }

  let auto = { topActions: [] };
  try {
    auto = await getAutoFollowupsResponse();
  } catch (_) {
    auto = { topActions: [] };
  }

  for (const t of auto.topActions || []) {
    if (rawInputs.length >= 25) break;
    if (!t || typeof t !== "object") continue;
    const cn = String(/** @type {{ customerName?: string }} */ (t).customerName || "").trim();
    const nk = normName(cn);
    const meta = nameMeta.get(nk) || {
      phone: "",
      email: "",
      customerId: "",
      paymentStatus: "",
    };
    const phone = String(/** @type {{ phone?: string }} */ (t).phone || meta.phone || "").trim();
    const email = String(/** @type {{ email?: string }} */ (t).email || meta.email || "").trim();
    const amount = Number(/** @type {{ amount?: unknown }} */ (t).amount) || 0;
    const customerId = String(meta.customerId || "").trim();
    const messageReady = !!(phone || email);
    const invoiceReady = !!(customerId && amount >= 200);
    let recommendedAction = "manual_review";
    const pri = String(/** @type {{ priority?: string }} */ (t).priority || "").toLowerCase();
    if (invoiceReady && (pri === "critical" || pri === "high")) {
      recommendedAction = "create_draft_invoice";
    } else if (messageReady) {
      recommendedAction = "send_followup";
    }
    rawInputs.push({
      customerName: cn,
      customerId,
      phone,
      email,
      amount,
      daysOld: Number(/** @type {{ daysOld?: unknown }} */ (t).daysOld) || 0,
      priority: String(/** @type {{ priority?: string }} */ (t).priority || ""),
      messageReady,
      invoiceReady,
      pricingStatus: priceNames.get(nk) || "clear",
      paymentStatus: meta.paymentStatus || "",
      recommendedAction,
      sourceType: "reactivation",
    });
  }

  try {
    const entries = readRecentEntries().entries || [];
    for (const r of entries.slice(0, 6)) {
      if (rawInputs.length >= 25) break;
      if (!r || typeof r !== "object") continue;
      const cn = String(/** @type {{ customerName?: string }} */ (r).customerName || "").trim();
      const nk = normName(cn);
      const meta = nameMeta.get(nk) || {
        phone: "",
        email: "",
        customerId: "",
        paymentStatus: "",
      };
      const intent = String(/** @type {{ intent?: string }} */ (r).intent || "");
      let recommendedAction = "send_followup";
      if (intent === "ready_to_pay") {
        recommendedAction = "create_draft_invoice";
      } else if (
        intent === "unknown" ||
        intent === "needs_revision" ||
        intent === "question"
      ) {
        recommendedAction = "manual_review";
      }
      let pricingStatus = priceNames.get(nk) || "clear";
      if (intent === "needs_revision") {
        pricingStatus = "review";
      }
      const messageReady = true;
      const invoiceReady = intent === "ready_to_pay" &&
        !!(meta.customerId && meta.phone);
      rawInputs.push({
        customerName: cn,
        customerId: meta.customerId,
        phone: meta.phone,
        email: meta.email,
        amount: 0,
        daysOld: 0,
        priority: "high",
        messageReady,
        invoiceReady,
        pricingStatus,
        paymentStatus: meta.paymentStatus || "",
        recommendedAction,
        sourceType: "response",
      });
    }
  } catch (_) {}

  let actPack = { actions: [] };
  try {
    actPack = await collectAutomationActions(15);
  } catch (_) {
    actPack = { actions: [] };
  }

  for (const a of actPack.actions || []) {
    if (rawInputs.length >= 25) break;
    if (!a || typeof a !== "object") continue;
    const cn = String(/** @type {{ customerName?: string }} */ (a).customerName || "").trim();
    const nk = normName(cn);
    const meta = nameMeta.get(nk) || {
      phone: "",
      email: "",
      customerId: "",
      paymentStatus: "",
    };
    const typ = String(/** @type {{ type?: string }} */ (a).type || "").toLowerCase();
    const amount = Number(/** @type {{ amount?: unknown }} */ (a).amount) || 0;
    let recommendedAction = "manual_review";
    if (typ === "invoice") {
      recommendedAction = "create_draft_invoice";
    } else if (typ === "production") {
      recommendedAction = "manual_review";
    } else {
      recommendedAction = "send_followup";
    }
    const messageReady = !!(meta.phone || meta.email);
    const customerId = String(meta.customerId || "").trim();
    const invoiceReady = typ === "invoice" && amount >= 200 && !!customerId;

    rawInputs.push({
      customerName: cn,
      customerId,
      phone: meta.phone,
      email: meta.email,
      amount,
      daysOld: Number(/** @type {{ daysOld?: unknown }} */ (a).daysOld) || 0,
      priority: String(/** @type {{ priority?: string }} */ (a).priority || ""),
      messageReady,
      invoiceReady,
      pricingStatus: priceNames.get(nk) || "clear",
      paymentStatus: meta.paymentStatus || "",
      recommendedAction,
      sourceType: "manual",
    });
  }

  /** @type {object[]} */
  const scored = [];
  for (const inp of rawInputs) {
    const r = scoreOpportunity(inp);
    scored.push({
      ...inp,
      score: r.score,
      cashPriority: r.cashPriority,
      scoreReason: r.reason,
      scoreFlags: r.flags,
    });
  }

  function rankScore(row) {
    if (!row || typeof row !== "object") return 0;
    const blocked =
      String(/** @type {{ pricingStatus?: string }} */ (row).pricingStatus || "")
        .toLowerCase() === "blocked";
    const adj = blocked ? -10000 : 0;
    return adj + Number(/** @type {{ score?: unknown }} */ (row).score) || 0;
  }
  scored.sort((a, b) => rankScore(b) - rankScore(a));

  const seen = new Set();
  /** @type {typeof scored} */
  const deduped = [];
  for (const row of scored) {
    const k = normName(row.customerName);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    deduped.push(row);
  }

  const top = deduped.slice(0, 10);

  for (const o of top) {
    const cp = String(/** @type {{ cashPriority?: string }} */ (o).cashPriority || "").toLowerCase();
    if (cp === "critical") summary.critical++;
    else if (cp === "high") summary.high++;
    else if (cp === "medium") summary.medium++;
    else summary.low++;
  }

  const opportunities = top.map((o) => ({
    customerName: String(o.customerName || ""),
    amount: Number(o.amount) || 0,
    daysOld: Number(o.daysOld) || 0,
    score: Number(o.score) || 0,
    cashPriority: String(o.cashPriority || "low"),
    recommendedAction: String(o.recommendedAction || ""),
    reason: String(o.scoreReason || ""),
    phone: String(o.phone || ""),
    email: String(o.email || ""),
    sourceType: String(o.sourceType || ""),
  }));

  return { opportunities, summary };
}

router.get("/priorities", async (_req, res) => {
  try {
    const out = await buildCashPrioritiesPayload();
    return res.json(out);
  } catch (err) {
    console.error("[cash/priorities]", err.message || err);
    return res.json({
      opportunities: [],
      summary: { critical: 0, high: 0, medium: 0, low: 0 },
    });
  }
});

/** @returns {Promise<object[]>} */
async function fetchCaptureOrdersForDeposits() {
  const prisma = getPrisma();
  if (!prisma || !prisma.captureOrder) return [];
  try {
    return await prisma.captureOrder.findMany({
      orderBy: { createdAt: "desc" },
      take: 80,
    });
  } catch (err) {
    console.error("[cash/deposits] capture orders", err.message || err);
    return [];
  }
}

/**
 * Bundle 38 — ranked deposit-collection targets (orders blocked by payment gate).
 * @returns {Promise<{ opportunities: object[], summary: object }>}
 */
async function buildDepositPrioritiesPayload() {
  const summary = { critical: 0, high: 0, medium: 0, low: 0 };
  /** @type {object[]} */
  const rawInputs = [];

  let orders = [];
  let founder = { paymentBlockers: [] };
  let rev = { unpaidInvoices: [], staleEstimates: [] };
  try {
    [orders, founder, rev] = await Promise.all([
      fetchCaptureOrdersForDeposits(),
      getFounderDashboardPayload(),
      getRevenueFollowups(),
    ]);
  } catch (err) {
    console.error("[cash/deposits] load", err.message || err);
  }

  const nameMeta = metaByCustomerName(rev);
  const priceNames = pricingStatusByName();
  const blockerIds = new Set(
    (founder.paymentBlockers || [])
      .map((b) => String(/** @type {{ orderId?: string }} */ (b).orderId || "").trim())
      .filter(Boolean)
  );

  for (const o of orders) {
    if (rawInputs.length >= 25) break;
    if (!o || typeof o !== "object") continue;
    const st = String(/** @type {{ status?: string }} */ (o).status || "")
      .trim()
      .toUpperCase();
    if (st === "DONE") continue;
    const gate = evaluatePaymentGate(captureOrderToGateInput(o));
    if (gate.allowedToProduce) continue;

    const oid = String(/** @type {{ id?: string }} */ (o).id || "").trim();
    const nk = normName(/** @type {{ customerName?: string }} */ (o).customerName);
    const meta = nameMeta.get(nk) || {
      phone: "",
      email: "",
      customerId: "",
      paymentStatus: "",
    };
    const depReq = /** @type {{ depositRequired?: boolean }} */ (o).depositRequired !== false;
    const depRec = /** @type {{ depositReceived?: boolean }} */ (o).depositReceived === true;
    const amount = Number(/** @type {{ balanceDue?: unknown }} */ (o).balanceDue) || 0;
    const payOrder = String(
      /** @type {{ paymentStatus?: string }} */ (o).paymentStatus || ""
    ).trim();
    const readyForProduction = st === "READY";

    let recommendedAction = "collect_deposit";
    if (st === "QUOTE" || st === "DEPOSIT") {
      recommendedAction = "send_deposit_invoice";
    }

    let priority = "";
    if (blockerIds.has(oid) || readyForProduction) {
      priority = "high";
    }

    rawInputs.push({
      orderId: oid,
      customerName: String(/** @type {{ customerName?: string }} */ (o).customerName || ""),
      customerId: String(meta.customerId || "").trim(),
      phone: String(meta.phone || "").trim(),
      email: String(meta.email || "").trim(),
      amount,
      status: st,
      paymentStatus: payOrder,
      depositRequired: depReq,
      depositReceived: depRec,
      pricingStatus: priceNames.get(nk) || "clear",
      priority,
      dueText: String(/** @type {{ dueDate?: string }} */ (o).dueDate || ""),
      recommendedAction,
      readyForProduction,
    });
  }

  /** @type {object[]} */
  const scored = [];
  for (const inp of rawInputs) {
    const r = scoreDepositOpportunity(inp);
    scored.push({
      ...inp,
      score: r.score,
      depositPriority: r.depositPriority,
      scoreReason: r.reason,
      scoreFlags: r.flags,
    });
  }

  function rankDeposit(row) {
    if (!row || typeof row !== "object") return 0;
    const blocked =
      String(/** @type {{ pricingStatus?: string }} */ (row).pricingStatus || "")
        .toLowerCase() === "blocked";
    const adj = blocked ? -10000 : 0;
    return adj + Number(/** @type {{ score?: unknown }} */ (row).score) || 0;
  }
  scored.sort((a, b) => rankDeposit(b) - rankDeposit(a));

  const seen = new Set();
  /** @type {typeof scored} */
  const deduped = [];
  for (const row of scored) {
    const id = String(/** @type {{ orderId?: string }} */ (row).orderId || "").trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    deduped.push(row);
  }

  const top = deduped.slice(0, 10);

  for (const o of top) {
    const dp = String(/** @type {{ depositPriority?: string }} */ (o).depositPriority || "").toLowerCase();
    if (dp === "critical") summary.critical++;
    else if (dp === "high") summary.high++;
    else if (dp === "medium") summary.medium++;
    else summary.low++;
  }

  const opportunities = top.map((o) => ({
    orderId: String(/** @type {{ orderId?: string }} */ (o).orderId || ""),
    customerName: String(/** @type {{ customerName?: string }} */ (o).customerName || ""),
    amount: Number(/** @type {{ amount?: unknown }} */ (o).amount) || 0,
    score: Number(/** @type {{ score?: unknown }} */ (o).score) || 0,
    depositPriority: String(/** @type {{ depositPriority?: string }} */ (o).depositPriority || "low"),
    reason: String(/** @type {{ scoreReason?: string }} */ (o).scoreReason || ""),
    phone: String(/** @type {{ phone?: string }} */ (o).phone || ""),
    email: String(/** @type {{ email?: string }} */ (o).email || ""),
    status: String(/** @type {{ status?: string }} */ (o).status || ""),
    paymentStatus: String(/** @type {{ paymentStatus?: string }} */ (o).paymentStatus || ""),
  }));

  return { opportunities, summary };
}

router.get("/deposits", async (_req, res) => {
  try {
    const out = await buildDepositPrioritiesPayload();
    return res.json(out);
  } catch (err) {
    console.error("[cash/deposits]", err.message || err);
    return res.json({
      opportunities: [],
      summary: { critical: 0, high: 0, medium: 0, low: 0 },
    });
  }
});

/**
 * @param {(s: unknown) => string} esc
 * @param {{ opportunities: object[] }} data
 * @param {{ appPrepareMessage?: boolean }} [opts]
 */
function cashPrioritiesSectionHtml(esc, data, opts) {
  const appPrep = !!(opts && opts.appPrepareMessage);
  const opps = (data && Array.isArray(data.opportunities) ? data.opportunities : []).slice(0, 5);
  if (!opps.length) {
    return (
      '<section style="margin:0 0 18px 0;padding:16px;border-radius:16px;background:#0f172a;border:1px solid #334155;">' +
      '<h2 style="font-size:1.02rem;margin:0 0 8px;color:#86efac;font-weight:800;">💰 CASH PRIORITIES</h2>' +
      '<p style="margin:0;font-size:0.9rem;opacity:0.78;line-height:1.45;">No cash opportunities ranked yet</p>' +
      '</section>'
    );
  }

  function hint(action) {
    const a = String(action || "").toLowerCase();
    if (a === "create_draft_invoice") return "Draft Invoice";
    if (a === "send_followup") return "Follow Up Now";
    if (a === "manual_review") return "Review";
    return "";
  }

  const cards = opps
    .map((o) => {
      if (!o || typeof o !== "object") return "";
      const pri = String(
        /** @type {{ cashPriority?: string }} */ (o).cashPriority || ""
      ).toUpperCase();
      let band =
        "background:#141414;border:1px solid #333;opacity:0.88;";
      if (pri === "CRITICAL") {
        band =
          "background:#450a0a;border:2px solid #ef4444;box-shadow:0 0 14px rgba(239,68,68,0.35);";
      } else if (pri === "HIGH") {
        band =
          "background:#2a1f0a;border:2px solid #f97316;";
      } else if (pri === "MEDIUM") {
        band = "background:#0f172a;border:1px solid #64748b;";
      } else if (pri === "LOW") {
        band =
          "background:#101010;border:1px solid #2a2a2a;opacity:0.72;";
      }
      const ra = String(/** @type {{ recommendedAction?: string }} */ (o).recommendedAction || "");
      const raLo = ra.toLowerCase();
      const h = hint(ra);
      const phone = String(/** @type {{ phone?: string }} */ (o).phone || "").trim();
      const email = String(/** @type {{ email?: string }} */ (o).email || "").trim();
      const contact = [phone ? "Phone" : "", email ? "Email" : ""]
        .filter(Boolean)
        .join(" · ") || "No phone/email";
      const cnRaw = String(
        /** @type {{ customerName?: string }} */ (o).customerName || ""
      ).trim();
      const amtNum = Math.round(Number(/** @type {{ amount?: unknown }} */ (o).amount) || 0);
      const daysN = Math.max(
        0,
        Math.floor(Number(/** @type {{ daysOld?: unknown }} */ (o).daysOld) || 0)
      );
      const prepType = raLo === "create_draft_invoice" ? "invoice" : "followup";
      const prepBtnStyle =
        "margin-top:6px;padding:10px 14px;border-radius:10px;font-weight:800;font-size:0.82rem;border:1px solid #334155;background:#1e293b;color:#7dd3fc;cursor:pointer;min-height:44px;width:100%;box-sizing:border-box;";
      const prepBlock =
        appPrep && cnRaw
          ? `<div style="margin-top:8px;">
    <button type="button" class="app-prep-msg" style="${prepBtnStyle}" data-type="${esc(
              prepType
            )}" data-name="${esc(cnRaw)}" data-amount="${esc(String(amtNum))}" data-days="${esc(
              String(daysN)
            )}">Prepare message</button>
    <pre class="app-prep-out" style="display:none;margin:8px 0 0;padding:10px;border-radius:10px;background:#0a0a0a;border:1px solid #333;font-size:0.78rem;white-space:pre-wrap;word-break:break-word;"></pre>
  </div>`
          : "";
      return `
  <div style="margin-bottom:10px;padding:12px;border-radius:12px;${band}">
    <div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start;">
      <strong style="font-size:1rem;line-height:1.3;">${esc(
        String(/** @type {{ customerName?: string }} */ (o).customerName || "—")
      )}</strong>
      <span style="font-size:0.65rem;font-weight:900;color:#fde047;white-space:nowrap;">${esc(pri)}</span>
    </div>
    <div style="margin-top:6px;font-size:0.88rem;">$${esc(
      String(Math.round(Number(/** @type {{ amount?: unknown }} */ (o).amount) || 0))
    )} · score ${esc(String(/** @type {{ score?: unknown }} */ (o).score ?? ""))}</div>
    <div style="margin-top:4px;font-size:0.78rem;opacity:0.8;">${esc(String(ra || "—"))}</div>
    <div style="margin-top:6px;font-size:0.82rem;line-height:1.4;opacity:0.9;">${esc(
      String(/** @type {{ reason?: string }} */ (o).reason || "").length > 120
        ? String(/** @type {{ reason?: string }} */ (o).reason).slice(0, 117) + "…"
        : String(/** @type {{ reason?: string }} */ (o).reason || "")
    )}</div>
    <div style="margin-top:6px;font-size:0.72rem;opacity:0.75;">${esc(contact)}</div>
    ${
      h
        ? `<div style="margin-top:8px;font-size:0.78rem;font-weight:800;color:#f0ff44;">${esc(h)}</div>`
        : ""
    }
    ${prepBlock}
  </div>`;
    })
    .filter(Boolean)
    .join("");

  return (
    '<section style="margin:0 0 18px 0;padding:16px;border-radius:16px;background:#0c1a14;border:1px solid #166534;">' +
    '<h2 style="font-size:1.02rem;margin:0 0 10px;color:#86efac;font-weight:800;">💰 CASH PRIORITIES</h2>' +
    cards +
    "</section>"
  );
}

/**
 * @param {(s: unknown) => string} esc
 * @param {{ opportunities: object[] }} data
 * @param {{ appPrepareMessage?: boolean }} [opts]
 */
function depositPrioritiesSectionHtml(esc, data, opts) {
  const appPrep = !!(opts && opts.appPrepareMessage);
  const opps = (data && Array.isArray(data.opportunities) ? data.opportunities : []).slice(0, 5);
  if (!opps.length) {
    return (
      '<section style="margin:0 0 18px 0;padding:16px;border-radius:16px;background:#0f172a;border:1px solid #334155;">' +
      '<h2 style="font-size:1.02rem;margin:0 0 8px;color:#a5f3fc;font-weight:800;">💵 DEPOSIT PRIORITIES</h2>' +
      '<p style="margin:0;font-size:0.9rem;opacity:0.78;line-height:1.45;">No deposit priorities ranked yet</p>' +
      "</section>"
    );
  }

  function actionHint(stRaw) {
    const st = String(stRaw || "").trim().toUpperCase();
    if (st === "READY") return "Payment Blocking Production";
    if (st === "QUOTE" || st === "DEPOSIT") return "Send Deposit Invoice";
    return "Collect Deposit";
  }

  const cards = opps
    .map((o) => {
      if (!o || typeof o !== "object") return "";
      const pri = String(
        /** @type {{ depositPriority?: string }} */ (o).depositPriority || ""
      ).toUpperCase();
      let band =
        "background:#141414;border:1px solid #333;opacity:0.88;";
      if (pri === "CRITICAL") {
        band =
          "background:#450a0a;border:2px solid #ef4444;box-shadow:0 0 14px rgba(239,68,68,0.35);";
      } else if (pri === "HIGH") {
        band = "background:#2a1f0a;border:2px solid #f97316;";
      } else if (pri === "MEDIUM") {
        band = "background:#0c4a6e;border:1px solid #38bdf8;";
      } else if (pri === "LOW") {
        band =
          "background:#101010;border:1px solid #2a2a2a;opacity:0.72;";
      }
      const st = String(/** @type {{ status?: string }} */ (o).status || "");
      const stUp = st.trim().toUpperCase();
      const pay = String(/** @type {{ paymentStatus?: string }} */ (o).paymentStatus || "");
      const hint = actionHint(st);
      const phone = String(/** @type {{ phone?: string }} */ (o).phone || "").trim();
      const email = String(/** @type {{ email?: string }} */ (o).email || "").trim();
      const contact = [phone ? "Phone" : "", email ? "Email" : ""]
        .filter(Boolean)
        .join(" · ") || "No phone/email";
      const cnRaw = String(
        /** @type {{ customerName?: string }} */ (o).customerName || ""
      ).trim();
      const amtNum = Math.round(Number(/** @type {{ amount?: unknown }} */ (o).amount) || 0);
      const prepType =
        stUp === "QUOTE" || stUp === "DEPOSIT" ? "invoice" : "followup";
      const prepBtnStyle =
        "margin-top:6px;padding:10px 14px;border-radius:10px;font-weight:800;font-size:0.82rem;border:1px solid #0e7490;background:#164e63;color:#a5f3fc;cursor:pointer;min-height:44px;width:100%;box-sizing:border-box;";
      const prepBlock =
        appPrep && cnRaw
          ? `<div style="margin-top:8px;">
    <button type="button" class="app-prep-msg" style="${prepBtnStyle}" data-type="${esc(
              prepType
            )}" data-name="${esc(cnRaw)}" data-amount="${esc(String(amtNum))}" data-days="0">Prepare message</button>
    <pre class="app-prep-out" style="display:none;margin:8px 0 0;padding:10px;border-radius:10px;background:#0a0a0a;border:1px solid #333;font-size:0.78rem;white-space:pre-wrap;word-break:break-word;"></pre>
  </div>`
          : "";
      const oid = String(/** @type {{ orderId?: string }} */ (o).orderId || "").trim();
      return `
  <div style="margin-bottom:10px;padding:12px;border-radius:12px;${band}">
    <div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start;">
      <strong style="font-size:1rem;line-height:1.3;">${esc(
        String(/** @type {{ customerName?: string }} */ (o).customerName || "—")
      )}</strong>
      <span style="font-size:0.65rem;font-weight:900;color:#7dd3fc;white-space:nowrap;">${esc(pri)}</span>
    </div>
    ${
      oid
        ? `<div style="margin-top:4px;font-size:0.68rem;opacity:0.7;word-break:break-all;">${esc(
            oid
          )}</div>`
        : ""
    }
    <div style="margin-top:6px;font-size:0.88rem;">$${esc(String(amtNum))} · score ${esc(
      String(/** @type {{ score?: unknown }} */ (o).score ?? "")
    )}</div>
    <div style="margin-top:4px;font-size:0.8rem;opacity:0.88;"><span style="opacity:0.75;">Status:</span> ${esc(
      stUp || "—"
    )} · <span style="opacity:0.75;">Pay:</span> ${esc(pay || "—")}</div>
    <div style="margin-top:6px;font-size:0.82rem;line-height:1.4;opacity:0.9;">${esc(
      String(/** @type {{ reason?: string }} */ (o).reason || "").length > 120
        ? String(/** @type {{ reason?: string }} */ (o).reason).slice(0, 117) + "…"
        : String(/** @type {{ reason?: string }} */ (o).reason || "")
    )}</div>
    <div style="margin-top:6px;font-size:0.72rem;opacity:0.75;">${esc(contact)}</div>
    <div style="margin-top:8px;font-size:0.78rem;font-weight:800;color:#67e8f9;">${esc(hint)}</div>
    ${prepBlock}
  </div>`;
    })
    .filter(Boolean)
    .join("");

  return (
    '<section style="margin:0 0 18px 0;padding:16px;border-radius:16px;background:#082f49;border:1px solid #0e7490;">' +
    '<h2 style="font-size:1.02rem;margin:0 0 10px;color:#a5f3fc;font-weight:800;">💵 DEPOSIT PRIORITIES</h2>' +
    cards +
    "</section>"
  );
}

module.exports = {
  router,
  buildCashPrioritiesPayload,
  cashPrioritiesSectionHtml,
  buildDepositPrioritiesPayload,
  depositPrioritiesSectionHtml,
};
