"use strict";
/**
 * Sales Follow-Up Engine 2.0 — read-only candidate typing, scoring, and ranking.
 * No I/O, no outreach sends. Consumers pass plain order/customer-shaped objects.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.inferFollowUpTypeFromOrder = inferFollowUpTypeFromOrder;
exports.scoreFollowUpCandidate = scoreFollowUpCandidate;
exports.rankFollowUpCandidates = rankFollowUpCandidates;
exports.groupByPriorityBand = groupByPriorityBand;
exports.groupByFollowUpType = groupByFollowUpType;
const EPS = 1e-6;
/**
 * Infer follow-up lane from an order-shaped row + age (days).
 * UNPAID_INVOICE: Square invoice refs + balance due.
 * STALE_ESTIMATE: quote/invoice-draft lane, not fully paid, aged enough to nudge.
 */
function inferFollowUpTypeFromOrder(input) {
    const st = String(input.status || "").toUpperCase();
    if (st === "BLOCKED" || input.manualOverride || input.blockedReason) {
        return "MANUAL_REVIEW";
    }
    if (!input.email || !String(input.email).includes("@")) {
        return "MANUAL_REVIEW";
    }
    const total = input.totalAmount > EPS
        ? input.totalAmount
        : input.quotedAmount != null && input.quotedAmount > 0
            ? input.quotedAmount
            : 0;
    const paid = Number(input.amountPaid) || 0;
    const hasInvoiceRef = !!(input.squareInvoiceId || input.squareInvoiceNumber);
    if (total > EPS &&
        paid + EPS < total &&
        hasInvoiceRef &&
        st !== "CANCELLED") {
        return "UNPAID_INVOICE";
    }
    if (["QUOTE_READY", "APPROVED", "INVOICE_DRAFTED"].includes(st) &&
        total > EPS &&
        paid + EPS < total &&
        input.ageDays >= 2) {
        return "STALE_ESTIMATE";
    }
    if (["QUOTE_READY", "APPROVED", "INVOICE_DRAFTED"].includes(st) &&
        input.ageDays >= 3) {
        return "STALE_ESTIMATE";
    }
    return "MANUAL_REVIEW";
}
function bandFromScore(score) {
    if (score >= 68)
        return "HIGH";
    if (score >= 42)
        return "MEDIUM";
    return "REVIEW_REQUIRED";
}
/**
 * Explainable score: higher = call sooner. Capped components.
 */
function scoreFollowUpCandidate(c) {
    const factors = [];
    let score = 0;
    switch (c.type) {
        case "UNPAID_INVOICE":
            score += 38;
            factors.push("type: unpaid / partial payment (+38)");
            break;
        case "STALE_ESTIMATE":
            score += 32;
            factors.push("type: stale quote / estimate lane (+32)");
            break;
        case "CUSTOMER_REACTIVATION":
            score += 26;
            factors.push("type: reactivation (+26)");
            break;
        case "MANUAL_REVIEW":
            score += 12;
            factors.push("type: manual review (+12)");
            break;
        default:
            factors.push("type: unknown (+0)");
    }
    const age = c.ageDays ?? 0;
    const ageBoost = Math.min(age * 1.2, 36);
    score += ageBoost;
    factors.push(`age: ${age.toFixed(1)}d (+${ageBoost.toFixed(1)} capped)`);
    const ev = c.estimatedValue ?? 0;
    const revBoost = Math.min(ev / 85, 34);
    score += revBoost;
    factors.push(`revenue hint: $${ev.toFixed(0)} (+${revBoost.toFixed(1)} capped)`);
    if (c.customerEmail && c.customerEmail.includes("@")) {
        score += 14;
        factors.push("contact: email present (+14)");
    }
    else {
        factors.push("contact: weak email (+0)");
    }
    if (c.reviewRequired) {
        score -= 22;
        factors.push("reviewRequired penalty (-22)");
    }
    score = Math.max(0, Math.round(score * 10) / 10);
    const band = bandFromScore(score);
    factors.push(`→ band ${band} (score ${score})`);
    return { score, band, factors };
}
function rankFollowUpCandidates(candidates) {
    const scored = candidates.map((c) => ({
        c,
        s: scoreFollowUpCandidate(c).score,
    }));
    scored.sort((a, b) => b.s - a.s);
    return scored.map((x) => x.c);
}
function groupByPriorityBand(ranked) {
    const out = {
        HIGH: [],
        MEDIUM: [],
        REVIEW_REQUIRED: [],
    };
    for (const c of ranked) {
        const { band } = scoreFollowUpCandidate(c);
        out[band].push(c);
    }
    return out;
}
function groupByFollowUpType(candidates) {
    const keys = [
        "STALE_ESTIMATE",
        "UNPAID_INVOICE",
        "CUSTOMER_REACTIVATION",
        "MANUAL_REVIEW",
    ];
    const acc = {};
    for (const k of keys)
        acc[k] = [];
    for (const c of candidates) {
        acc[c.type].push(c);
    }
    return acc;
}
