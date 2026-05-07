"use strict";
/**
 * Hourly follow-ups: deposits (24h), proofs (24h since sent), pickup (2d+).
 * Uses customerCommsService sendDepositReminder, sendProofRequestComm, sendPickupReady only.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.runFollowUps = void 0;
exports.runFollowups = runFollowups;
const client_1 = require("@prisma/client");
const client_2 = require("../db/client");
const logger_1 = require("../utils/logger");
const customerCommsService_1 = require("./customerCommsService");
const memoryService = require("./memoryService.js");
const MS_24H = 24 * 60 * 60 * 1000;
const MS_48H = 48 * 60 * 60 * 1000;
async function hasRecentComm(orderId, types, sinceMs) {
    const since = new Date(Date.now() - sinceMs);
    const row = await client_2.db.customerCommunication.findFirst({
        where: {
            orderId,
            type: { in: types },
            createdAt: { gte: since },
        },
        select: { id: true },
    });
    return !!row;
}
function mem(type, data) {
    try {
        if (typeof memoryService.logEvent === "function") {
            memoryService.logEvent(type, data);
        }
    }
    catch {
        /* optional */
    }
}
async function runDepositFollowups() {
    const cutoff = new Date(Date.now() - MS_24H);
    const orders = await client_2.db.order.findMany({
        where: {
            deletedAt: null,
            status: { in: ["QUOTE_SENT", "AWAITING_DEPOSIT"] },
            depositStatus: { not: client_1.OrderDepositStatus.PAID },
            createdAt: { lte: cutoff },
        },
        take: 40,
        orderBy: { updatedAt: "asc" },
    });
    for (const o of orders) {
        const recent = await hasRecentComm(o.id, [customerCommsService_1.COMM_TYPES.DEPOSIT_REMINDER], MS_24H);
        if (recent) {
            mem("followup_skipped", {
                kind: "deposit",
                orderId: o.id,
                reason: "reminder_sent_within_24h",
            });
            continue;
        }
        try {
            await (0, customerCommsService_1.sendDepositReminder)(o.id);
            mem("followup_sent", { kind: "deposit", orderId: o.id });
            logger_1.logger.info(`[followupEngine] deposit reminder ${o.id}`);
        }
        catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            mem("followup_skipped", { kind: "deposit", orderId: o.id, reason: msg });
            logger_1.logger.warn(`[followupEngine] deposit skip ${o.id}: ${msg}`);
        }
    }
}
async function runProofFollowups() {
    const cutoff = new Date(Date.now() - MS_24H);
    const orders = await client_2.db.order.findMany({
        where: {
            deletedAt: null,
            proofRequired: true,
            proofStatus: "SENT",
            proofSentAt: { not: null, lte: cutoff },
            status: { not: "CANCELLED" },
        },
        take: 40,
        orderBy: { proofSentAt: "asc" },
    });
    for (const o of orders) {
        const recent = await hasRecentComm(o.id, [customerCommsService_1.COMM_TYPES.PROOF_REQUEST, customerCommsService_1.COMM_TYPES.STATUS_UPDATE], MS_24H);
        if (recent) {
            mem("followup_skipped", {
                kind: "proof",
                orderId: o.id,
                reason: "proof_or_status_comm_within_24h",
            });
            continue;
        }
        try {
            await (0, customerCommsService_1.sendProofRequestComm)(o.id);
            mem("followup_sent", { kind: "proof", orderId: o.id });
            logger_1.logger.info(`[followupEngine] proof follow-up ${o.id}`);
        }
        catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            mem("followup_skipped", { kind: "proof", orderId: o.id, reason: msg });
            logger_1.logger.warn(`[followupEngine] proof skip ${o.id}: ${msg}`);
        }
    }
}
/** QC/READY and stale ≥48h; sendPickupReady only (dedup: no PICKUP_READY comm in 48h). */
async function runPickupFollowups() {
    const cutoff = new Date(Date.now() - MS_48H);
    const orders = await client_2.db.order.findMany({
        where: {
            deletedAt: null,
            status: { in: ["QC", "READY"] },
            updatedAt: { lte: cutoff },
        },
        take: 40,
        orderBy: { updatedAt: "asc" },
    });
    for (const o of orders) {
        const recent = await hasRecentComm(o.id, [customerCommsService_1.COMM_TYPES.PICKUP_READY], MS_48H);
        if (recent) {
            mem("followup_skipped", {
                kind: "pickup",
                orderId: o.id,
                reason: "pickup_comm_within_48h",
            });
            continue;
        }
        try {
            await (0, customerCommsService_1.sendPickupReady)(o.id);
            mem("followup_sent", { kind: "pickup", orderId: o.id });
            logger_1.logger.info(`[followupEngine] pickup ${o.id}`);
        }
        catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            mem("followup_skipped", { kind: "pickup", orderId: o.id, reason: msg });
            logger_1.logger.warn(`[followupEngine] pickup skip ${o.id}: ${msg}`);
        }
    }
}
async function runFollowups() {
    await runDepositFollowups();
    await runProofFollowups();
    await runPickupFollowups();
}
/** Alias for followUpJob */
exports.runFollowUps = runFollowups;
