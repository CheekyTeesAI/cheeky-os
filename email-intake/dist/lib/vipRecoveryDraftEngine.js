"use strict";
/**
 * VIP Recovery Draft + Offer Strategy — review-only email, owner-call scripts, and
 * advisory offer angles. No sends, no pricing authority, no auto-discounts.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildVipRecoveryDraft = buildVipRecoveryDraft;
exports.buildVipRecoveryDrafts = buildVipRecoveryDrafts;
exports.groupVipRecoveryDraftsByTier = groupVipRecoveryDraftsByTier;
function firstName(name) {
    if (!name || !String(name).trim())
        return "there";
    const p = String(name).trim().split(/\s+/)[0];
    return p || "there";
}
function fmtMoney(n) {
    if (!Number.isFinite(n) || n < 0)
        return "?";
    return `$${Math.round(n).toLocaleString("en-US")}`;
}
function buildCopy(tier, c, greet) {
    const spend = c.estimatedHistoricalSpend;
    const orders = c.historicalOrderCount;
    const largest = c.largestKnownOrderValue;
    const days = c.daysSinceLastOrder;
    const daysLabel = days != null ? `about ${Math.floor(days)}` : "some";
    switch (tier) {
        case "TIER_1_WHALE":
            return {
                subject: "Personal check-in — Cheeky Tees (your account)",
                emailBody: `Hi ${greet},

I’m reaching out directly because you’ve been an important Cheeky Tees customer — roughly ${fmtMoney(spend)} across ${orders} order(s), with your largest project around ${fmtMoney(largest)}. It’s been ${daysLabel} days since we last shipped something for you, and I wanted to see if you have anything on the horizon.

If you’d rather talk than type, reply with a good time for a quick call — we’ll prioritize your quote and production slot.

Thank you for trusting us before; we’d love to earn the next one.

— Cheeky Tees`,
                ownerCallScript: `Opener (owner): “Hi ${greet}, it’s [name] from Cheeky Tees — I’m calling our best past partners personally.”
Acknowledge history: “We’ve done roughly ${fmtMoney(spend)} together across ${orders} runs.”
Intent: “Anything coming up — staff shirts, events, restocks?”
Ask: “Want a refreshed quote this week, or should I check back next quarter?”
Close: “I’ll follow up by email with one clear next step — sound good?”`,
                offerSuggestion: "Advisory: position as priority handling / expedited quote review — any commercial sweetener must be approved in Cheeky OS; do not promise discounts from this template.",
                offerStrategyType: "PRIORITY_OWNER_TOUCH",
                tone: "confident, premium, relationship-based, non-needy",
                draftWhy: "Tier 1: highest-touch lane; assumes strong history and warrants owner-level tone without inventing price cuts.",
            };
        case "TIER_2_HIGH_VALUE":
            return {
                subject: "Refresh your Cheeky quote — we’re ready when you are",
                emailBody: `Hi ${greet},

We’ve valued working with you (roughly ${fmtMoney(spend)} with us, last touch ~${daysLabel} days ago). If you have new quantities, styles, or deadlines, we can turn around a fresh quote quickly — same quality, less back-and-forth than starting cold.

Reply with a sentence on what you’re thinking (even rough), or ask for a quick call.

Best,
Cheeky Tees`,
                ownerCallScript: `“Hey ${greet}, Cheeky Tees — not a cold call; you’re a repeat account.”
“Roughly ${fmtMoney(spend)} history — curious if anything’s in the pipeline.”
“If yes: I’ll get art + quantities and send options. If no: want a quarterly check-in?”`,
                offerSuggestion: "Advisory: emphasize speed and reorder convenience — bundle or multi-style angles only if they match your margin rules.",
                offerStrategyType: "QUOTE_REFRESH",
                tone: "warm, professional, efficient",
                draftWhy: "Tier 2: strong value; lead with quote refresh and speed, not desperation.",
            };
        case "TIER_3_WORTH_REVIEW":
            return {
                subject: "Still here — Cheeky Tees",
                emailBody: `Hi ${greet},

Quick hello from Cheeky Tees. You’ve ordered with us before (~${fmtMoney(spend)} total), and it’s been ${daysLabel} days since the last project. When something pops up — even small — reply and we’ll line up options.

No pressure — relationship first.

Thanks,
Cheeky Tees`,
                ownerCallScript: `Light touch (<45s unless they engage).
“Calling past customers we’d like to stay connected with — anything upcoming?”
If no: “Mind if we send one email per quarter?”`,
                offerSuggestion: "Advisory: relationship-first; optional ‘artwork refresh’ or ‘minimum reorder check-in’ if prior jobs had heavy setup — no automatic incentive.",
                offerStrategyType: "RELATIONSHIP_FIRST",
                tone: "respectful, light, non-spammy",
                draftWhy: "Tier 3: structured touch without implying financial distress.",
            };
        case "REVIEW_REQUIRED":
            return {
                subject: "Follow-up — Cheeky Tees (internal review)",
                emailBody: `Hi ${greet},

I’m preparing a personal follow-up from Cheeky Tees. Internal notes: ${c.reason}

Before anything is sent, please confirm contact details and account history in Cheeky OS.

Thanks,
Cheeky Tees`,
                ownerCallScript: `Do not call until: verify email/phone in CRM, confirm no open balance/blockers.
Internal: ${c.suggestedAction}
Keep script minimal until data is clean.`,
                offerSuggestion: "Advisory: no offer angle until contact and account state are verified.",
                offerStrategyType: "ADVISORY_ONLY",
                tone: "neutral, cautious, operator-led",
                draftWhy: "Weak signals or contact — minimal copy; operator fills facts and commercial posture.",
            };
    }
}
/**
 * Returns null for excluded candidates — callers should not surface drafts.
 */
function buildVipRecoveryDraft(c) {
    if (c.excluded || c.recoveryTier === "EXCLUDE") {
        return null;
    }
    const tier = c.recoveryTier;
    const greet = firstName(c.customerName);
    const pack = buildCopy(tier, c, greet);
    const weakEmail = !c.customerEmail || !String(c.customerEmail).includes("@");
    const weakPhone = !c.customerPhone || !String(c.customerPhone).trim();
    const reviewRequired = tier === "REVIEW_REQUIRED" || weakEmail;
    let body = pack.emailBody.trim();
    if (reviewRequired && tier !== "REVIEW_REQUIRED") {
        body += `

—
Draft note: confirm identity and account facts in Cheeky OS before send.`;
    }
    if (tier === "REVIEW_REQUIRED") {
        body += `

—
Draft note: manual review required — do not send until verified.`;
    }
    let script = pack.ownerCallScript.trim();
    if (weakPhone && tier !== "REVIEW_REQUIRED") {
        script += `

(No reliable phone — lead with email; add number if located in CRM.)`;
    }
    return {
        recoveryTier: tier,
        vipRecoveryScore: c.vipRecoveryScore,
        customerId: c.customerId,
        customerName: c.customerName,
        customerEmail: c.customerEmail,
        customerPhone: c.customerPhone,
        subject: pack.subject,
        emailBody: body,
        ownerCallScript: script,
        offerSuggestion: pack.offerSuggestion,
        offerStrategyType: pack.offerStrategyType,
        tone: pack.tone,
        reason: c.reason,
        suggestedAction: c.suggestedAction,
        reviewRequired,
        draftWhy: pack.draftWhy,
        rawContext: { ...c.rawContext, scoreFactors: c.scoreFactors },
    };
}
function buildVipRecoveryDrafts(candidates) {
    const out = [];
    for (const c of candidates) {
        const d = buildVipRecoveryDraft(c);
        if (d)
            out.push(d);
    }
    return out;
}
const TIER_ORDER = [
    "TIER_1_WHALE",
    "TIER_2_HIGH_VALUE",
    "TIER_3_WORTH_REVIEW",
    "REVIEW_REQUIRED",
];
function groupVipRecoveryDraftsByTier(drafts) {
    const acc = {
        TIER_1_WHALE: [],
        TIER_2_HIGH_VALUE: [],
        TIER_3_WORTH_REVIEW: [],
        REVIEW_REQUIRED: [],
    };
    for (const d of drafts) {
        if (d.recoveryTier in acc) {
            acc[d.recoveryTier].push(d);
        }
    }
    for (const t of TIER_ORDER) {
        acc[t].sort((a, b) => b.vipRecoveryScore - a.vipRecoveryScore);
    }
    return acc;
}
