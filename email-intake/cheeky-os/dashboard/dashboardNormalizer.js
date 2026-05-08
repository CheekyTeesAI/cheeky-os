"use strict";

/**
 * Canonical card shape for operator dashboard sections (v8.1).
 * @typedef {{
 *   id: string,
 *   title: string,
 *   status: string,
 *   priority: string,
 *   stage: string,
 *   customer: string|null,
 *   dueDate: string|null,
 *   source: string,
 *   blocker: string|null,
 *   recommendedAction: string|null,
 *   approvalRequired: boolean,
 * }} DashboardCard
 */

function safeStr(v, max = 280) {
  const s = v == null ? "" : String(v);
  return s.length > max ? s.slice(0, max - 2) + "…" : s;
}

/** @returns {DashboardCard} */
function normalizeOrderLike(h, source, overrides) {
  const o = overrides && typeof overrides === "object" ? overrides : {};
  const stuck = Array.isArray(h.stuckReasons) && h.stuckReasons.length ? String(h.stuckReasons[0]) : null;
  const blocker =
    h.blockedReason && String(h.blockedReason).trim()
      ? String(h.blockedReason).trim()
      : stuck
        ? stuck
        : null;

  let rec = o.recommendedAction != null ? o.recommendedAction : null;
  if (rec == null) {
    if (!h.depositPaid && (h.squareInvoiceId || h.squareInvoicePublished)) {
      rec = "Collect or confirm deposit before production.";
    } else if (
      h.needsCustomerApproval ||
      /REQUESTED|CHANGES_REQUESTED/i.test(String(h.artApprovalStatus || ""))
    ) {
      rec = "Customer art/proof approval needed.";
    } else if (h.canonicalStage === "GARMENTS_NEEDED" || (h.depositPaid && h.garmentOrderNeeded && !h.garmentsOrdered)) {
      rec = "Create garment order draft — approval before vendor send.";
    } else if (String(h.canonicalStage || "").includes("ART") || stuck) {
      rec = "Resolve art/design blockers.";
    }
  }

  return {
    id: safeStr(h.id || o.idFallback || `row-${Math.random()}`, 80),
    title: safeStr(
      o.title || `${h.orderNumber ? `#${h.orderNumber}` : "Order"}${h.customerName ? ` · ${h.customerName}` : ""}`,
      200
    ),
    status: safeStr(h.status || o.statusFallback || ""),
    priority: safeStr(h.operatorProductionPriority || o.priorityFallback || "NORMAL", 48),
    stage: safeStr(h.canonicalStage || o.stageFallback || ""),
    customer: h.customerName ? safeStr(h.customerName, 120) : null,
    dueDate:
      h.quoteExpiresAt != null
        ? safeStr(
            typeof h.quoteExpiresAt === "string"
              ? h.quoteExpiresAt
              : h.quoteExpiresAt && typeof h.quoteExpiresAt.toISOString === "function"
                ? h.quoteExpiresAt.toISOString()
                : String(h.quoteExpiresAt),
            40
          )
        : null,
    source: safeStr(source, 32),
    blocker: blocker ? safeStr(blocker, 400) : null,
    recommendedAction: rec != null ? safeStr(rec, 400) : null,
    approvalRequired: !!(h.needsCustomerApproval || o.approvalRequired || (h.commsDraftCount || 0) > 0),
  };
}

/** @returns {DashboardCard} */
function normalizeCashRisk(raw, idx, source) {
  const kind = raw.kind || "risk";
  const ref = raw.reference || raw.orderId || `cash-${idx}`;
  const titleRaw = raw.label || raw.customerName || kind.replace(/_/g, " ");
  let rec = "Review in Square invoices / estimates.";
  if (kind === "deposit_missing_db") rec = "Match Square payment to deposit or chase customer.";
  if (kind === "estimate_followup") rec = "Follow up on stale open Square order.";
  return {
    id: safeStr(ref, 120),
    title: safeStr(titleRaw, 200),
    status: safeStr(raw.status || ""),
    priority: raw.kind === "deposit_missing_db" ? "HIGH" : "NORMAL",
    stage: safeStr(kind, 80),
    customer: raw.customerName ? safeStr(raw.customerName, 120) : null,
    dueDate: null,
    source: safeStr(source, 32),
    blocker: null,
    recommendedAction: rec,
    approvalRequired: false,
  };
}

/** @returns {DashboardCard} */
function normalizeApproval(raw, idx, source) {
  return {
    id: safeStr(raw.approvalId || `apr-${idx}`, 80),
    title: `${safeStr(raw.category || "Approval", 60)} · ${safeStr(raw.taskId || "", 80)}`,
    status: safeStr(raw.status || "pending"),
    priority: safeStr(raw.riskLevel || "NORMAL", 48),
    stage: "APPROVAL_QUEUE",
    customer: null,
    dueDate: raw.requestedAt ? safeStr(raw.requestedAt, 40) : null,
    source: safeStr(source, 32),
    blocker: raw.reason ? safeStr(raw.reason, 400) : null,
    recommendedAction: "Review in /api/approvals pending list.",
    approvalRequired: true,
  };
}

function flattenProductionColumns(columns, source) {
  /** @type {DashboardCard[]} */
  const out = [];
  if (!columns || typeof columns !== "object") return out;
  const labels = [
    ["approvedForProduction", "APPROVED_FOR_PRODUCTION"],
    ["garmentsNeeded", "GARMENTS_NEEDED"],
    ["garmentsOrdered", "GARMENTS_ORDERED"],
    ["productionReady", "PRODUCTION_READY"],
    ["inProduction", "IN_PRODUCTION"],
    ["qc", "QC"],
    ["readyForPickup", "READY_FOR_PICKUP"],
  ];
  labels.forEach(([key, stageLabel]) => {
    const arr = columns[key] || [];
    arr.forEach((h) =>
      out.push(
        normalizeOrderLike(h, source, {
          stageFallback: stageLabel,
          title: `#${h.orderNumber || "?"} · ${stageLabel}`,
        })
      )
    );
  });
  return out;
}

/** Intake buckets → merged cards */
function normalizeIntakePipeline(intake, source) {
  /** @type {DashboardCard[]} */
  const cards = [];
  if (!intake) return cards;
  const pushBucket = (arr, suffix) => {
    (arr || []).forEach((h) =>
      cards.push(normalizeOrderLike(h, source, { recommendedAction: `Intake · ${suffix}` }))
    );
  };
  pushBucket(intake.newRequests, "New request");
  pushBucket(intake.estimateNeeded, "Estimate needed");
  pushBucket(intake.invoiceNeeded, "Invoice / deposit path");
  pushBucket(intake.waitingCustomer, "Waiting on customer");
  return cards.slice(0, 120);
}

/** Art queues → prioritize “needed” for operator */
function normalizeArtPipeline(art, source) {
  /** @type {DashboardCard[]} */
  const cards = [];
  if (!art) return cards;
  (art.missing || []).forEach((h) =>
    cards.push(
      normalizeOrderLike(h, source, {
        stageFallback: "ART_NEEDED",
        recommendedAction: "Send art to digitizing or acquire files.",
      })
    )
  );
  (art.digitizing || []).forEach((h) =>
    cards.push(normalizeOrderLike(h, source, { stageFallback: "DIGITIZING", recommendedAction: "Track digitizer turnaround." }))
  );
  (art.pendingApproval || []).forEach((h) =>
    cards.push(normalizeOrderLike(h, source, { recommendedAction: "Get customer proof approval." }))
  );
  return cards.slice(0, 100);
}

function normalizeGarments(garmentBoard, source) {
  /** @type {DashboardCard[]} */
  const cards = [];
  if (!garmentBoard) return cards;
  (garmentBoard.needingBlanks || []).forEach((h) =>
    cards.push(
      normalizeOrderLike(h, source, {
        stageFallback: "GARMENTS_NEEDED",
        recommendedAction: "Draft Carolina Made order (approval before send).",
      })
    )
  );
  (garmentBoard.waitingOnGarments || []).forEach((h) =>
    cards.push(
      normalizeOrderLike(h, source, {
        stageFallback: "GARMENTS_ORDERED",
        recommendedAction: "Track shipment / receive blanks.",
      })
    )
  );
  return cards.slice(0, 100);
}

function normalizeBlockedSummary(blockPayload, source) {
  /** @type {DashboardCard[]} */
  const cards = [];
  (blockPayload && blockPayload.orders ? blockPayload.orders : []).forEach((h, i) =>
    cards.push(normalizeOrderLike(h, source, { title: `Blocked · ${h.customerName || h.id}` }))
  );
  return cards;
}

function normalizeSections({ intake, cash, art, garments, production, approvals, blocked }, sourceLive) {
  const live = safeStr(sourceLive, 24) || "live";
  /** @type {Record<string, { cards: DashboardCard[], sectionSource: string }>} */
  const out = {};
  const cashCards = ((cash && cash.risks) || []).slice(0, 80).map((r, i) => normalizeCashRisk(r, i, live));
  out.cash = { cards: cashCards, sectionSource: live };

  const intakeCards = normalizeIntakePipeline(intake, live);
  out.intake = { cards: intakeCards, sectionSource: live };

  const artCards = normalizeArtPipeline(art, live);
  out.art = { cards: artCards, sectionSource: live };

  const garmentCards = normalizeGarments(garments, live);
  out.garments = { cards: garmentCards, sectionSource: live };

  const prodCols = production && production.columns ? production.columns : {};
  const prodCards = flattenProductionColumns(prodCols, live);
  out.production = { cards: prodCards, sectionSource: live };

  const apprCards = ((approvals && approvals.pending) || []).slice(0, 100).map((a, i) => normalizeApproval(a, i, live));
  out.approvals = { cards: apprCards, sectionSource: live };

  out.blocked = { cards: normalizeBlockedSummary(blocked, live), sectionSource: live };

  return out;
}

module.exports = {
  normalizeOrderLike,
  normalizeCashRisk,
  normalizeApproval,
  flattenProductionColumns,
  normalizeIntakePipeline,
  normalizeArtPipeline,
  normalizeGarments,
  normalizeBlockedSummary,
  normalizeSections,
};
