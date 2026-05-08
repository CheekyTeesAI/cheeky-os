"use strict";
/**
 * VIP / Whale Customer Recovery — read-only scoring and tiering.
 * No I/O. Uses rolled-up order facts produced by callers (scripts/services).
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.VIP_TOO_RECENT_DAYS = exports.VIP_MIN_DORMANCY_DAYS = void 0;
exports.scoreVipRecoveryCustomer = scoreVipRecoveryCustomer;
exports.rankVipRecoveryCandidates = rankVipRecoveryCandidates;
exports.groupVipRecoveryByTier = groupVipRecoveryByTier;
const EPS = 1e-6;
/** Minimum days since last order touch to consider VIP recovery (not "too recent"). */
exports.VIP_MIN_DORMANCY_DAYS = 45;
/** Below this dormancy, customer is out of scope for this report (too hot). */
exports.VIP_TOO_RECENT_DAYS = 30;
function orderValue(o) {
    const t = Math.max(Number(o.totalAmount) || 0, Number(o.total) || 0);
    const q = o.quotedAmount != null && o.quotedAmount > 0 ? Number(o.quotedAmount) : 0;
    return Math.max(t, q);
}
function paid(o) {
    return Math.max(0, Number(o.amountPaid) || 0);
}
function isTerminal(st) {
    const u = String(st || "").toUpperCase();
    return u === "CANCELLED" || u === "COMPLETED";
}
function hasMaterialOpenBalance(o) {
    if (isTerminal(o.status))
        return false;
    const v = orderValue(o);
    if (v <= EPS)
        return false;
    return v - paid(o) > 25;
}
function hasBlockedOrder(orders) {
    return orders.some((o) => String(o.status || "").toUpperCase() === "BLOCKED" ||
        !!(o.blockedReason && String(o.blockedReason).trim()));
}
function computeInterOrderStats(orders) {
    const sorted = [...orders].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    if (sorted.length < 2) {
        return { last, first, avgGapDays: null };
    }
    let sumMs = 0;
    for (let i = 1; i < sorted.length; i++) {
        sumMs += sorted[i].createdAt.getTime() - sorted[i - 1].createdAt.getTime();
    }
    const avgGapDays = sumMs / (sorted.length - 1) / 86400000;
    return { last, first, avgGapDays };
}
/**
 * Score and tier one customer rollup. Explainable factors in `scoreFactors`.
 */
function scoreVipRecoveryCustomer(rollup) {
    const orders = rollup.orders.filter((o) => o && o.id);
    const factors = [];
    const weakEmail = !rollup.customerEmail || !String(rollup.customerEmail).includes("@");
    const weakPhone = !rollup.customerPhone || !String(rollup.customerPhone).trim();
    if (orders.length === 0) {
        return {
            customerId: rollup.customerId,
            customerName: rollup.customerName,
            customerEmail: rollup.customerEmail,
            customerPhone: rollup.customerPhone,
            daysSinceLastOrder: null,
            historicalOrderCount: 0,
            estimatedHistoricalSpend: 0,
            largestKnownOrderValue: 0,
            repeatCustomer: false,
            avgHistoricalOrderGapDays: null,
            dormancyVsTypicalRatio: null,
            vipRecoveryScore: 0,
            recoveryTier: "EXCLUDE",
            reason: "No non-deleted orders for this customer.",
            suggestedAction: "ignore for now",
            excluded: true,
            exclusionReason: "no_orders",
            scoreFactors: ["no orders"],
            rawContext: {},
        };
    }
    const { last, first, avgGapDays } = computeInterOrderStats(orders);
    const now = Date.now();
    const daysSinceLast = (now - last.updatedAt.getTime()) / 86400000;
    let lifetimePaid = 0;
    let largest = 0;
    for (const o of orders) {
        const p = paid(o);
        lifetimePaid += p;
        const ov = Math.max(orderValue(o), p);
        if (ov > largest)
            largest = ov;
    }
    const repeat = orders.length >= 2;
    let dormancyRatio = null;
    if (avgGapDays != null && avgGapDays > 1) {
        dormancyRatio = daysSinceLast / avgGapDays;
    }
    const delinquent = orders.some((o) => hasMaterialOpenBalance(o));
    const blocked = hasBlockedOrder(orders);
    /** Pool: dormant enough + historically material. */
    if (daysSinceLast < exports.VIP_TOO_RECENT_DAYS) {
        return buildExcluded(rollup, daysSinceLast, lifetimePaid, largest, orders.length, repeat, avgGapDays, dormancyRatio, "too_recent", `Last order activity ~${Math.floor(daysSinceLast)}d ago — too recent for VIP recovery list.`, factors);
    }
    if (lifetimePaid < EPS) {
        return buildExcluded(rollup, daysSinceLast, lifetimePaid, largest, orders.length, repeat, avgGapDays, dormancyRatio, "no_paid_history", "No recorded payments on file — not a whale recovery candidate.", factors);
    }
    if (daysSinceLast < exports.VIP_MIN_DORMANCY_DAYS) {
        return buildExcluded(rollup, daysSinceLast, lifetimePaid, largest, orders.length, repeat, avgGapDays, dormancyRatio, "not_dormant_enough", `Only ~${Math.floor(daysSinceLast)}d since last activity; VIP track starts after ~${exports.VIP_MIN_DORMANCY_DAYS}d quiet.`, factors);
    }
    if (delinquent) {
        return buildExcluded(rollup, daysSinceLast, lifetimePaid, largest, orders.length, repeat, avgGapDays, dormancyRatio, "open_balance", "Open balance / collection-sensitive state — reconcile money path before VIP-style outreach.", factors);
    }
    if (blocked) {
        return buildExcluded(rollup, daysSinceLast, lifetimePaid, largest, orders.length, repeat, avgGapDays, dormancyRatio, "blocked_order", "BLOCKED / blockedReason on an order — clear ops blockers first.", factors);
    }
    let score = 0;
    const spendPts = Math.min(38, lifetimePaid / 220);
    score += spendPts;
    factors.push(`lifetime paid ~$${lifetimePaid.toFixed(0)} (+${spendPts.toFixed(1)} /38)`);
    const countPts = Math.min(14, Math.max(0, orders.length - 1) * 3.5);
    score += countPts;
    factors.push(`order count ${orders.length} (+${countPts.toFixed(1)} /14)`);
    const largePts = Math.min(18, largest / 450);
    score += largePts;
    factors.push(`largest order ~$${largest.toFixed(0)} (+${largePts.toFixed(1)} /18)`);
    const dormPts = Math.min(16, Math.max(0, daysSinceLast - exports.VIP_MIN_DORMANCY_DAYS) / 6);
    score += dormPts;
    factors.push(`dormancy ~${Math.floor(daysSinceLast)}d since last touch (+${dormPts.toFixed(1)} /16)`);
    if (repeat) {
        score += 7;
        factors.push("repeat customer (+7)");
    }
    if (largest >= 3500) {
        score += 10;
        factors.push("high-ticket signal (+10)");
    }
    else if (largest >= 1800) {
        score += 5;
        factors.push("elevated ticket (+5)");
    }
    if (dormancyRatio != null && dormancyRatio >= 2.2) {
        const gapPts = Math.min(8, (dormancyRatio - 2) * 3);
        score += gapPts;
        factors.push(`quiet vs typical pattern ×${dormancyRatio.toFixed(2)} (+${gapPts.toFixed(1)} /8)`);
    }
    score = Math.max(0, Math.round(score * 10) / 10);
    let tier;
    if (weakEmail) {
        tier = "REVIEW_REQUIRED";
        score = Math.min(score, 62);
        factors.push("weak email — cap score & review tier");
    }
    else if (score >= 78) {
        tier = "TIER_1_WHALE";
    }
    else if (score >= 60) {
        tier = "TIER_2_HIGH_VALUE";
    }
    else {
        tier = "TIER_3_WORTH_REVIEW";
    }
    if (weakPhone) {
        factors.push("no phone on file — prefer personalized email; add number in CRM if found");
    }
    const reason = buildWhy(tier, lifetimePaid, orders.length, daysSinceLast, largest, dormancyRatio, weakEmail);
    const suggestedAction = suggestedForTier(tier, weakEmail);
    return {
        customerId: rollup.customerId,
        customerName: rollup.customerName,
        customerEmail: rollup.customerEmail,
        customerPhone: rollup.customerPhone,
        daysSinceLastOrder: Math.round(daysSinceLast * 10) / 10,
        historicalOrderCount: orders.length,
        estimatedHistoricalSpend: Math.round(lifetimePaid * 100) / 100,
        largestKnownOrderValue: Math.round(largest * 100) / 100,
        repeatCustomer: repeat,
        avgHistoricalOrderGapDays: avgGapDays != null ? Math.round(avgGapDays * 10) / 10 : null,
        dormancyVsTypicalRatio: dormancyRatio != null ? Math.round(dormancyRatio * 100) / 100 : null,
        vipRecoveryScore: score,
        recoveryTier: tier,
        reason,
        suggestedAction,
        excluded: false,
        exclusionReason: null,
        scoreFactors: factors,
        rawContext: {
            firstOrderAt: first.createdAt.toISOString(),
            lastOrderAt: last.updatedAt.toISOString(),
        },
    };
}
function buildExcluded(rollup, daysSinceLast, lifetimePaid, largest, orderCount, repeat, avgGapDays, dormancyRatio, code, message, factors) {
    factors.push(`excluded (${code})`);
    return {
        customerId: rollup.customerId,
        customerName: rollup.customerName,
        customerEmail: rollup.customerEmail,
        customerPhone: rollup.customerPhone,
        daysSinceLastOrder: Number.isFinite(daysSinceLast) ? Math.round(daysSinceLast * 10) / 10 : null,
        historicalOrderCount: orderCount,
        estimatedHistoricalSpend: Math.round(lifetimePaid * 100) / 100,
        largestKnownOrderValue: Math.round(largest * 100) / 100,
        repeatCustomer: repeat,
        avgHistoricalOrderGapDays: avgGapDays != null ? Math.round(avgGapDays * 10) / 10 : null,
        dormancyVsTypicalRatio: dormancyRatio != null ? Math.round(dormancyRatio * 100) / 100 : null,
        vipRecoveryScore: 0,
        recoveryTier: "EXCLUDE",
        reason: message,
        suggestedAction: "ignore for now",
        excluded: true,
        exclusionReason: code,
        scoreFactors: factors,
        rawContext: { exclusionCode: code },
    };
}
function buildWhy(tier, lifetimePaid, orderCount, daysSinceLast, largest, dormancyRatio, weakEmail) {
    const parts = [
        `~$${lifetimePaid.toFixed(0)} lifetime paid across ${orderCount} order(s)`,
        `~${Math.floor(daysSinceLast)}d since last activity`,
        `largest single lane ~$${largest.toFixed(0)}`,
    ];
    if (dormancyRatio != null && dormancyRatio >= 1.5) {
        parts.push(`quiet period ~${dormancyRatio.toFixed(1)}× typical spacing`);
    }
    if (weakEmail) {
        parts.push("verify email before outreach");
    }
    const label = tier === "TIER_1_WHALE"
        ? "Top-value dormant account — prioritize owner-style recovery."
        : tier === "TIER_2_HIGH_VALUE"
            ? "Strong historical value — personalized recovery."
            : tier === "TIER_3_WORTH_REVIEW"
                ? "Worth a structured touch when bandwidth allows."
                : "Review.";
    return `${label} ${parts.join("; ")}.`;
}
function suggestedForTier(tier, weakEmail) {
    if (weakEmail)
        return "manual review";
    switch (tier) {
        case "TIER_1_WHALE":
            return "owner call";
        case "TIER_2_HIGH_VALUE":
            return "personalized email draft";
        case "TIER_3_WORTH_REVIEW":
            return "personalized email draft";
        case "REVIEW_REQUIRED":
            return "manual review";
        default:
            return "ignore for now";
    }
}
function rankVipRecoveryCandidates(candidates) {
    const active = candidates.filter((c) => !c.excluded);
    const ex = candidates.filter((c) => c.excluded);
    active.sort((a, b) => b.vipRecoveryScore - a.vipRecoveryScore);
    ex.sort((a, b) => a.customerId.localeCompare(b.customerId));
    return [...active, ...ex];
}
const TIER_ORDER = [
    "TIER_1_WHALE",
    "TIER_2_HIGH_VALUE",
    "TIER_3_WORTH_REVIEW",
    "REVIEW_REQUIRED",
    "EXCLUDE",
];
function groupVipRecoveryByTier(candidates) {
    const acc = {
        TIER_1_WHALE: [],
        TIER_2_HIGH_VALUE: [],
        TIER_3_WORTH_REVIEW: [],
        REVIEW_REQUIRED: [],
        EXCLUDE: [],
    };
    for (const c of candidates) {
        acc[c.recoveryTier].push(c);
    }
    for (const t of TIER_ORDER) {
        acc[t].sort((a, b) => {
            if (b.vipRecoveryScore !== a.vipRecoveryScore) {
                return b.vipRecoveryScore - a.vipRecoveryScore;
            }
            return a.customerId.localeCompare(b.customerId);
        });
    }
    return acc;
}
