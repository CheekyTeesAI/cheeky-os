"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runQuoteRevival = runQuoteRevival;
exports.registerQuoteRevivalInterval = registerQuoteRevivalInterval;
const client_1 = require("../db/client");
const revenueLogger_1 = require("./revenueLogger");
const salesAgent_1 = require("./salesAgent");
const TWENTY_FOUR_H_MS = 24 * 60 * 60 * 1000;
/** In-memory: last revive run per order (no schema). Throttle to once / 24h per order. */
const lastReviveAt = new Map();
/**
 * Finds QUOTE orders older than 24h and runs sales agent (generate-only, console).
 */
async function runQuoteRevival() {
    try {
        const cutoff = new Date(Date.now() - TWENTY_FOUR_H_MS);
        const now = Date.now();
        const candidates = await client_1.db.order.findMany({
            where: { deletedAt: null, createdAt: { lt: cutoff } },
            select: { id: true, status: true },
        });
        const stale = candidates.filter((o) => String(o.status).toUpperCase() === "QUOTE");
        (0, revenueLogger_1.logRevenueEvent)("SALES_REVIVE_RUN", "batch", `${stale.length} stale quote(s)`);
        for (const o of stale) {
            const prev = lastReviveAt.get(o.id);
            if (prev !== undefined && now - prev < TWENTY_FOUR_H_MS) {
                continue;
            }
            try {
                await (0, salesAgent_1.runSalesAgentForOrder)(o.id, {
                    autoSend: false,
                    channel: "console",
                    reason: "revive",
                });
                lastReviveAt.set(o.id, now);
            }
            catch (e) {
                console.error("[reviveQuotes] order", o.id, e);
            }
        }
    }
    catch (err) {
        console.error("[reviveQuotes] runQuoteRevival", err);
    }
}
let revivalRegistered = false;
/** Idempotent: safe to call once from server bootstrap. */
function registerQuoteRevivalInterval() {
    if (revivalRegistered)
        return;
    revivalRegistered = true;
    setInterval(() => {
        try {
            void runQuoteRevival();
        }
        catch (e) {
            console.error("[reviveQuotes] interval", e);
        }
    }, 60 * 60 * 1000);
}
