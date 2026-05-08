"use strict";
/**
 * Assisted Outreach Draft Engine — turns follow-up candidates into reviewable
 * subject/body drafts only. No sends, no I/O.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildOutreachDraft = buildOutreachDraft;
exports.buildOutreachDraftsForCandidates = buildOutreachDraftsForCandidates;
function firstName(name) {
    if (!name || !String(name).trim())
        return "there";
    const p = String(name).trim().split(/\s+/)[0];
    return p || "there";
}
function orderRef(c) {
    const on = c.rawContext?.orderNumber;
    if (typeof on === "string" && on.trim())
        return on.trim();
    return c.sourceRef.slice(0, 8);
}
/**
 * Build a single customer-safe draft from a ranked follow-up candidate.
 * Uncertain rows get a visible review footer; MANUAL_REVIEW stays minimal.
 */
function buildOutreachDraft(c) {
    const greet = firstName(c.customerName);
    const ref = c.sourceType === "ORDER" ? orderRef(c) : "your Cheeky Tees account";
    let subject = "";
    let body = "";
    let draftWhy = "";
    switch (c.type) {
        case "STALE_ESTIMATE":
            subject = "Following up on your Cheeky Tees estimate";
            body = `Hi ${greet},

I wanted to check in on the estimate we discussed — happy to adjust quantities, pricing, or timing if anything has changed on your side.

If you’re ready to move forward, reply with a quick yes and we’ll line up production.

Thanks,
Cheeky Tees`;
            draftWhy =
                "Stale-estimate template: nudge for acceptance or clarification without pressure.";
            break;
        case "UNPAID_INVOICE":
            subject = "Reminder: open balance on your Cheeky Tees order";
            body = `Hi ${greet},

This is a friendly reminder that there’s still an open balance on your order (reference ${ref}). If you’ve already paid, reply and we’ll reconcile on our side. If you need the payment link again, just ask and we’ll send it.

Thank you,
Cheeky Tees`;
            draftWhy =
                "Unpaid-invoice template: balance reminder; operator should attach real payment link if sending.";
            break;
        case "CUSTOMER_REACTIVATION":
            subject = "Checking in — Cheeky Tees";
            body = `Hi ${greet},

It’s been a while since we last worked together. If you have upcoming apparel or promo needs, reply with a rough idea of quantities and styles and we’ll put together a fresh quote.

No rush — here when you’re ready.

Best,
Cheeky Tees`;
            draftWhy =
                "Reactivation template: soft re-engage; no discount promises unless you add them.";
            break;
        case "MANUAL_REVIEW":
            subject = "Following up — Cheeky Tees";
            body = `Hi ${greet},

I’m following up regarding ${c.sourceType === "ORDER" ? `order ${ref}` : "your account"}. ${c.suggestedAction}

Please reply if you have questions.

Thanks,
Cheeky Tees`;
            draftWhy =
                "Manual-review template: minimal copy — operator must fill gaps using internal context.";
            break;
    }
    const reviewRequired = c.reviewRequired || c.type === "MANUAL_REVIEW";
    if (reviewRequired) {
        body += `

—
Draft note: review required before send — confirm amounts, facts, and tone in Cheeky OS.`;
    }
    return {
        followUpType: c.type,
        priorityScore: c.priorityScore,
        customerName: c.customerName,
        customerEmail: c.customerEmail,
        customerPhone: c.customerPhone,
        subject,
        body: body.trim(),
        tone: "concise, professional, direct, non-aggressive",
        reason: c.reason,
        suggestedAction: c.suggestedAction,
        reviewRequired,
        sourceRef: c.sourceRef,
        sourceType: c.sourceType,
        draftWhy,
        rawContext: c.rawContext,
    };
}
/** Map ranked candidates to drafts in the same order. */
function buildOutreachDraftsForCandidates(candidates) {
    return candidates.map((c) => buildOutreachDraft(c));
}
