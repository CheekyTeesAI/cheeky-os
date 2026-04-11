/**
 * Message builder using branding env defaults.
 */
"use strict";
function brand() {
    return {
        biz: process.env.CHEEKY_BIZ_NAME || "Cheeky Tees",
        phone: process.env.CHEEKY_PHONE || "864-498-3475",
        promo: process.env.CHEEKY_PROMO || ""
    };
}
function buildMessage(customer, tier, campaignType) {
    const b = brand();
    const first = String(customer.name || "there").trim().split(/\s+/)[0] || "there";
    const intro = tier === "HOT"
        ? `Hey ${first}, quick one — we can lock your print slot today.`
        : tier === "WARM"
            ? `Hey ${first}, wanted to check in and get your next order moving.`
            : tier === "COLD"
                ? `Hey ${first}, it has been a minute — want a quick quote refresh?`
                : `Hey ${first}, we would love to earn your next order when timing works.`;
    const campaignLine = `Campaign: ${campaignType.replace(/-/g, " ")}.`;
    const promoLine = b.promo ? `Promo: ${b.promo}.` : "";
    const text = `${intro} ${campaignLine} ${promoLine} Reply here and ${b.biz} can prep it fast.\n\n— ${b.biz}\n${b.phone}`.trim();
    return {
        subject: `${b.biz} follow-up`,
        text
    };
}
module.exports = { buildMessage };
