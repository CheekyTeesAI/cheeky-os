"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runFollowUps = runFollowUps;
const client_1 = require("../db/client");
const revenueLogger_1 = require("./revenueLogger");
const TWO_H_MS = 2 * 60 * 60 * 1000;
const TWENTY_FOUR_H_MS = 24 * 60 * 60 * 1000;
/** orderId → which follow-up tiers already sent (in-memory; resets on process restart) */
const sent2h = new Set();
const sent24h = new Set();
function buildMessage(status, customerName, orderId) {
    const greeting = customerName && customerName.trim().length > 0
        ? `Hey ${customerName.trim()} —`
        : "Hey —";
    const ref = ` (Order ${orderId})`;
    if (String(status).toUpperCase() === "QUOTE") {
        return `${greeting} Just checking if you had a chance to review your quote. I can get this started today.${ref}`;
    }
    if (String(status).toUpperCase() === "NEEDS_REVIEW") {
        return `${greeting} I just need a quick confirmation on your order details so I can move forward.${ref}`;
    }
    return `${greeting} follow-up on your order.${ref}`;
}
/**
 * Revenue follow-ups for orders awaiting quote or review.
 * Sends at most one message in the 2h tier and one in the 24h tier per order (deduped in memory).
 */
async function runFollowUps() {
    const now = Date.now();
    const candidates = await client_1.db.order.findMany({
        where: { deletedAt: null },
        include: {
            customer: { select: { name: true, email: true } },
        },
    });
    const followUpStatuses = new Set(["QUOTE", "NEEDS_REVIEW"]);
    const orders = candidates.filter((o) => followUpStatuses.has(String(o.status)));
    for (const order of orders) {
        if (String(order.status).toUpperCase() === "PAID") {
            continue;
        }
        const email = order.customer?.email?.trim();
        if (!email)
            continue;
        const ageMs = now - order.createdAt.getTime();
        const name = order.customer?.name;
        let shouldSend = false;
        if (ageMs >= TWENTY_FOUR_H_MS) {
            if (!sent24h.has(order.id)) {
                sent24h.add(order.id);
                if (!sent2h.has(order.id))
                    sent2h.add(order.id);
                shouldSend = true;
            }
        }
        else if (ageMs >= TWO_H_MS) {
            if (!sent2h.has(order.id)) {
                sent2h.add(order.id);
                shouldSend = true;
            }
        }
        if (!shouldSend)
            continue;
        const message = buildMessage(String(order.status), name, order.id);
        (0, revenueLogger_1.logRevenueEvent)("follow_up_triggered", order.id, email);
        console.log(`FOLLOW-UP → ${email} → ${message}`);
    }
}
