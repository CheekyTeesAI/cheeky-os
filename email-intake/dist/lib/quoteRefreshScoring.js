"use strict";
/**
 * Quote refresh + reorder acceleration — read-only typing, scoring, ranking.
 * No I/O, no quote mutations, no sends.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.scoreOrderAcceleration = scoreOrderAcceleration;
exports.scoreEasyReorderAcceleration = scoreEasyReorderAcceleration;
exports.rankAccelerationCandidates = rankAccelerationCandidates;
exports.groupAccelerationByType = groupAccelerationByType;
const followUpScoring_1 = require("./followUpScoring");
const EPS = 1e-6;
function mapFollowUpToAcceleration(t) {
    switch (t) {
        case "STALE_ESTIMATE":
            return "STALE_QUOTE_REFRESH";
        case "UNPAID_INVOICE":
            return "LOW_FRICTION_FOLLOWUP";
        case "MANUAL_REVIEW":
            return "REVIEW_REQUIRED";
        case "CUSTOMER_REACTIVATION":
            return null;
        default:
            return null;
    }
}
function orderValue(o) {
    const ta = Number(o.totalAmount) || 0;
    const tot = o.total != null ? Number(o.total) || 0 : 0;
    const q = o.quotedAmount != null && o.quotedAmount > 0 ? Number(o.quotedAmount) : 0;
    return Math.max(ta, tot, q);
}
function outstanding(o) {
    const v = orderValue(o);
    const p = Number(o.amountPaid) || 0;
    return Math.max(0, v - p);
}
/**
 * Score a single open order for acceleration (stale quote, low-friction pay, or review).
 * Returns null if this order lane is not an acceleration target (e.g. completed elsewhere).
 */
function scoreOrderAcceleration(o, history) {
    const st = String(o.status || "").toUpperCase();
    if (st === "CANCELLED")
        return null;
    if (st === "COMPLETED")
        return null;
    if (st === "PAID_IN_FULL" && outstanding(o) <= EPS)
        return null;
    const ageDays = (Date.now() - o.updatedAt.getTime()) / 86400000;
    const lane = (0, followUpScoring_1.inferFollowUpTypeFromOrder)({
        status: o.status,
        amountPaid: Number(o.amountPaid) || 0,
        totalAmount: Number(o.totalAmount) || 0,
        quotedAmount: o.quotedAmount,
        squareInvoiceId: o.squareInvoiceId,
        squareInvoiceNumber: o.squareInvoiceNumber,
        ageDays,
        blockedReason: o.blockedReason,
        manualOverride: o.manualOverride === true,
        email: o.email,
    });
    const mapped = mapFollowUpToAcceleration(lane);
    if (mapped == null)
        return null;
    const weakEmail = !o.email || !String(o.email).includes("@");
    if (mapped === "REVIEW_REQUIRED") {
        const st0 = String(o.status || "").toUpperCase();
        const hasSignal = weakEmail ||
            st0 === "BLOCKED" ||
            !!(o.blockedReason && String(o.blockedReason).trim()) ||
            o.manualOverride === true ||
            orderValue(o) >= 45 ||
            outstanding(o) > EPS ||
            ageDays >= 6;
        if (!hasSignal)
            return null;
    }
    const factors = [];
    const outstand = outstanding(o);
    let score = 0;
    let reorderLikelihood = "UNKNOWN";
    if (history.historicalOrderCount >= 2) {
        reorderLikelihood = history.historicalOrderCount >= 3 ? "HIGH" : "MEDIUM";
    }
    else {
        reorderLikelihood = "LOW";
    }
    if (mapped === "STALE_QUOTE_REFRESH") {
        score += 22;
        factors.push("lane: stale quote / estimate (+22)");
        const agePts = Math.min(34, Math.max(0, ageDays - 2) * 1.05);
        score += agePts;
        factors.push(`quote age ~${ageDays.toFixed(1)}d (+${agePts.toFixed(1)} /34)`);
        const valPts = Math.min(24, orderValue(o) / 95);
        score += valPts;
        factors.push(`open value ~$${orderValue(o).toFixed(0)} (+${valPts.toFixed(1)} /24)`);
        if (history.historicalOrderCount >= 2) {
            score += 10;
            factors.push("repeat customer (+10)");
        }
        if (outstand > 500) {
            score += 6;
            factors.push("material open amount (+6)");
        }
    }
    else if (mapped === "LOW_FRICTION_FOLLOWUP") {
        score += 28;
        factors.push("lane: balance due w/ invoice path (+28)");
        const balPts = Math.min(36, outstand / 55);
        score += balPts;
        factors.push(`outstanding ~$${outstand.toFixed(0)} (+${balPts.toFixed(1)} /36)`);
        const agePts = Math.min(14, ageDays * 0.45);
        score += agePts;
        factors.push(`age (+${agePts.toFixed(1)} /14)`);
        score += 8;
        factors.push("invoice / payment rail likely (+8)");
    }
    else {
        score += 18;
        factors.push("lane: manual / ambiguous (+18)");
        const valPts = Math.min(12, orderValue(o) / 200);
        score += valPts;
        factors.push(`context value (+${valPts.toFixed(1)})`);
        if (weakEmail) {
            score += 4;
            factors.push("weak contact (+4 review weight)");
        }
    }
    score = Math.max(0, Math.round(score * 10) / 10);
    const reviewRequired = mapped === "REVIEW_REQUIRED" || weakEmail;
    if (reviewRequired && mapped !== "REVIEW_REQUIRED") {
        score = Math.min(score, 72);
        factors.push("capped: review signal");
    }
    const reason = mapped === "STALE_QUOTE_REFRESH"
        ? `Quote/estimate aging (~${ageDays.toFixed(0)}d) with ~$${orderValue(o).toFixed(0)} on the line — refresh to close.`
        : mapped === "LOW_FRICTION_FOLLOWUP"
            ? `Open balance ~$${outstand.toFixed(0)} with invoice rails — near-cash follow-up.`
            : `Needs operator triage before acceleration (contact, blockers, or lane).`;
    const suggestedAction = mapped === "STALE_QUOTE_REFRESH"
        ? "refresh quote"
        : mapped === "LOW_FRICTION_FOLLOWUP"
            ? "send payment / balance follow-up draft"
            : "review manually";
    return {
        type: mapped,
        priorityScore: score,
        customerId: o.customerId,
        customerName: o.customerName,
        customerEmail: o.email,
        customerPhone: o.phone,
        sourceRef: o.orderId,
        sourceType: "ORDER",
        quoteAgeDays: Math.round(ageDays * 10) / 10,
        daysSinceLastOrder: history.daysSinceLastOrder,
        historicalOrderCount: history.historicalOrderCount,
        estimatedHistoricalSpend: history.estimatedHistoricalSpend,
        reorderLikelihood,
        reason,
        suggestedAction,
        reviewRequired,
        scoreFactors: factors,
        rawContext: {
            orderNumber: o.orderNumber,
            status: o.status,
            followUpLane: lane,
        },
    };
}
/**
 * Repeat customers in a reorder sweet-spot window; skipped if a quote is already open.
 */
function scoreEasyReorderAcceleration(r) {
    if (r.orderCount < 2)
        return null;
    if (r.lifetimePaid < 120)
        return null;
    if (r.hasOpenQuoteLaneOrder)
        return null;
    const d = r.daysSinceLastOrder;
    if (d < 32 || d > 200)
        return null;
    const factors = [];
    let score = 20;
    factors.push("repeat customer base (+20)");
    const spendPts = Math.min(26, r.lifetimePaid / 140);
    score += spendPts;
    factors.push(`lifetime ~$${r.lifetimePaid.toFixed(0)} (+${spendPts.toFixed(1)} /26)`);
    const repPts = Math.min(16, (r.orderCount - 1) * 5);
    score += repPts;
    factors.push(`orders=${r.orderCount} (+${repPts.toFixed(1)} /16)`);
    if (d >= 40 && d <= 120) {
        score += 18;
        factors.push("sweet-spot recency 40–120d (+18)");
    }
    else {
        const sweet = Math.max(0, 12 - Math.abs(d - 80) / 25);
        score += sweet;
        factors.push(`recency ~${d.toFixed(0)}d (+${sweet.toFixed(1)})`);
    }
    if (r.avgOrderGapDays != null && r.avgOrderGapDays > 5) {
        const ratio = d / r.avgOrderGapDays;
        if (ratio >= 1.2 && ratio <= 3.5) {
            const g = Math.min(10, (ratio - 1) * 6);
            score += g;
            factors.push(`gap vs typical ×${ratio.toFixed(2)} (+${g.toFixed(1)})`);
        }
    }
    score = Math.max(0, Math.round(score * 10) / 10);
    const weakEmail = !r.customerEmail || !String(r.customerEmail).includes("@");
    let reorderLikelihood = r.orderCount >= 4 ? "HIGH" : r.orderCount >= 3 ? "MEDIUM" : "LOW";
    if (weakEmail) {
        reorderLikelihood = "UNKNOWN";
        score = Math.min(score, 58);
        factors.push("weak email — cap & review");
    }
    return {
        type: "EASY_REORDER",
        priorityScore: score,
        customerId: r.customerId,
        customerName: r.customerName,
        customerEmail: r.customerEmail,
        customerPhone: r.customerPhone,
        sourceRef: r.customerId,
        sourceType: "CUSTOMER",
        quoteAgeDays: null,
        daysSinceLastOrder: Math.round(d * 10) / 10,
        historicalOrderCount: r.orderCount,
        estimatedHistoricalSpend: Math.round(r.lifetimePaid * 100) / 100,
        reorderLikelihood,
        reason: `Repeat buyer (~$${r.lifetimePaid.toFixed(0)} across ${r.orderCount} orders); ~${Math.floor(d)}d since last activity — good reorder acceleration window.`,
        suggestedAction: "send reorder draft",
        reviewRequired: weakEmail,
        scoreFactors: factors,
        rawContext: { avgOrderGapDays: r.avgOrderGapDays },
    };
}
function rankAccelerationCandidates(candidates) {
    const copy = [...candidates];
    copy.sort((a, b) => {
        if (b.priorityScore !== a.priorityScore) {
            return b.priorityScore - a.priorityScore;
        }
        return a.sourceRef.localeCompare(b.sourceRef);
    });
    return copy;
}
const TYPE_ORDER = [
    "STALE_QUOTE_REFRESH",
    "EASY_REORDER",
    "LOW_FRICTION_FOLLOWUP",
    "REVIEW_REQUIRED",
];
function groupAccelerationByType(candidates) {
    const acc = {
        STALE_QUOTE_REFRESH: [],
        EASY_REORDER: [],
        LOW_FRICTION_FOLLOWUP: [],
        REVIEW_REQUIRED: [],
    };
    for (const c of candidates) {
        acc[c.type].push(c);
    }
    for (const t of TYPE_ORDER) {
        acc[t].sort((a, b) => b.priorityScore - a.priorityScore);
    }
    return acc;
}
