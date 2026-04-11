"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifySquareSignature = verifySquareSignature;
exports.extractEventId = extractEventId;
exports.extractEventType = extractEventType;
exports.extractInvoiceId = extractInvoiceId;
exports.extractSquareOrderId = extractSquareOrderId;
exports.extractInvoiceNumber = extractInvoiceNumber;
exports.extractPaymentAmountDollars = extractPaymentAmountDollars;
exports.extractInvoiceAmountPaidDollars = extractInvoiceAmountPaidDollars;
exports.extractInvoiceStatus = extractInvoiceStatus;
exports.extractPaymentStatus = extractPaymentStatus;
exports.processSquareWebhook = processSquareWebhook;
const client_1 = require("@prisma/client");
const client_2 = require("../db/client");
const logger_1 = require("../utils/logger");
const jobCreationService_1 = require("./jobCreationService");
const sharepointOrderSync_1 = require("./sharepointOrderSync");
const teamsNotificationService_1 = require("./teamsNotificationService");
const EPS = 1e-6;
/** Stub: wire HMAC verification with SQUARE_WEBHOOK_SIGNATURE_KEY when ready. */
function verifySquareSignature(_rawBody, _signatureHeader) {
    // TODO: Verify body using Square webhook signature key (see Square Webhooks docs).
    return true;
}
function asRecord(v) {
    return v && typeof v === "object" && !Array.isArray(v)
        ? v
        : null;
}
function extractEventId(payload) {
    const p = asRecord(payload);
    if (!p)
        return null;
    const raw = p.event_id ?? p.eventId ?? p.id;
    const s = typeof raw === "string" ? raw.trim() : "";
    return s || null;
}
function extractEventType(payload) {
    const p = asRecord(payload);
    if (!p)
        return null;
    const raw = p.type ?? p.event_type ?? p.eventType;
    return typeof raw === "string" ? raw.trim() : null;
}
function getDataObject(payload) {
    const p = asRecord(payload);
    const data = asRecord(p?.data);
    const obj = asRecord(data?.object);
    return obj;
}
function extractInvoiceId(payload) {
    const obj = getDataObject(payload);
    const inv = asRecord(obj?.invoice);
    const raw = inv?.id ?? obj?.id;
    if (typeof raw === "string" && raw.trim())
        return raw.trim();
    const p = asRecord(payload);
    const data = asRecord(p?.data);
    if (typeof data?.id === "string" &&
        extractEventType(payload) === "invoice.updated") {
        return data.id.trim();
    }
    return null;
}
function extractSquareOrderId(payload) {
    const obj = getDataObject(payload);
    const pay = asRecord(obj?.payment);
    const inv = asRecord(obj?.invoice);
    const raw = pay?.order_id ??
        pay?.orderId ??
        inv?.order_id ??
        inv?.orderId ??
        obj?.order_id;
    return typeof raw === "string" && raw.trim() ? raw.trim() : null;
}
function extractInvoiceNumber(payload) {
    const obj = getDataObject(payload);
    const inv = asRecord(obj?.invoice);
    const raw = inv?.invoice_number ?? inv?.invoiceNumber;
    return typeof raw === "string" && raw.trim() ? raw.trim() : null;
}
function moneyToDollars(m) {
    const r = asRecord(m);
    if (!r)
        return null;
    const amt = r.amount;
    if (typeof amt === "bigint")
        return Number(amt) / 100;
    if (typeof amt === "number" && Number.isFinite(amt))
        return amt / 100;
    if (typeof amt === "string" && amt.trim()) {
        const n = Number(amt);
        return Number.isFinite(n) ? n / 100 : null;
    }
    return null;
}
function extractPaymentAmountDollars(payload) {
    const obj = getDataObject(payload);
    const pay = asRecord(obj?.payment);
    if (!pay)
        return null;
    const total = moneyToDollars(pay.total_money ?? pay.amount_money);
    if (total !== null && total >= 0)
        return round2(total);
    return moneyToDollars(pay.amount_money);
}
function extractInvoiceAmountPaidDollars(payload) {
    const obj = getDataObject(payload);
    const inv = asRecord(obj?.invoice);
    if (!inv)
        return null;
    const paid = moneyToDollars(inv.amount_paid_money ??
        inv.amountPaidMoney ??
        inv.total_completed_amount_money ??
        inv.totalCompletedAmountMoney);
    if (paid !== null)
        return round2(paid);
    const reqs = inv.payment_requests ?? inv.paymentRequests;
    if (!Array.isArray(reqs))
        return null;
    let sum = 0;
    for (const r of reqs) {
        const row = asRecord(r);
        const m = moneyToDollars(row?.total_completed_amount_money ?? row?.computed_amount_money);
        if (m !== null)
            sum += m;
    }
    return sum > 0 ? round2(sum) : null;
}
function extractInvoiceStatus(payload) {
    const obj = getDataObject(payload);
    const inv = asRecord(obj?.invoice);
    const raw = inv?.status ?? inv?.invoice_status;
    return typeof raw === "string" ? raw : null;
}
function extractPaymentStatus(payload) {
    const obj = getDataObject(payload);
    const pay = asRecord(obj?.payment);
    const raw = pay?.status;
    return typeof raw === "string" ? raw : null;
}
function round2(n) {
    return Math.round(n * 100) / 100;
}
function paymentIndicatesMoneyCollected(payload) {
    const st = (extractPaymentStatus(payload) || "").toUpperCase();
    return st === "COMPLETED" || st === "APPROVED" || st === "CAPTURED";
}
function canTransitionToDepositPaid(status) {
    const s = status.toUpperCase();
    return ["QUOTE_READY", "APPROVED", "INVOICE_DRAFTED"].includes(s);
}
function canTransitionToPaidInFull(status) {
    const s = status.toUpperCase();
    if (s === "PAID_IN_FULL")
        return false;
    return [
        "DEPOSIT_PAID",
        "PRODUCTION",
        "QC",
        "READY",
        "INVOICE_DRAFTED",
        "QUOTE_READY",
        "APPROVED",
    ].includes(s);
}
function shouldAutoTransitionStatus(status) {
    const s = status.toUpperCase();
    return !["BLOCKED", "INTAKE"].includes(s);
}
async function processSquareWebhook(payload) {
    const eventId = extractEventId(payload);
    if (!eventId) {
        return { success: false, message: "Missing webhook event id" };
    }
    const eventType = extractEventType(payload) ?? "unknown";
    const existing = await client_2.db.processedWebhookEvent.findUnique({
        where: { id: eventId },
    });
    if (existing) {
        return { success: true, message: "already processed" };
    }
    const invoiceId = extractInvoiceId(payload);
    const sqOrderId = extractSquareOrderId(payload);
    const invoiceNumber = extractInvoiceNumber(payload);
    let order = invoiceId ?
        await client_2.db.order.findFirst({ where: { squareInvoiceId: invoiceId } })
        : null;
    if (!order && sqOrderId) {
        order = await client_2.db.order.findFirst({ where: { squareOrderId: sqOrderId } });
    }
    if (!order && invoiceNumber) {
        order = await client_2.db.order.findFirst({
            where: { squareInvoiceNumber: invoiceNumber },
        });
    }
    if (!order) {
        logger_1.logger.warn("Square webhook: no Order matched", {
            eventId,
            eventType,
            invoiceId,
            sqOrderId,
            invoiceNumber,
        });
        return {
            success: false,
            message: "No matching order for invoice/order/invoice number in payload",
        };
    }
    const squareInvStatus = extractInvoiceStatus(payload);
    const squarePayStatus = extractPaymentStatus(payload);
    let newAmountPaid = round2(order.amountPaid ?? 0);
    if (eventType === "payment.updated") {
        const add = extractPaymentAmountDollars(payload);
        if (add !== null && add > 0 && paymentIndicatesMoneyCollected(payload)) {
            newAmountPaid = round2(newAmountPaid + add);
        }
    }
    if (eventType === "invoice.updated") {
        const invPaid = extractInvoiceAmountPaidDollars(payload);
        if (invPaid !== null && invPaid > 0) {
            newAmountPaid = round2(Math.max(newAmountPaid, invPaid));
        }
    }
    const quoted = order.quotedAmount;
    const depositReq = order.depositRequired !== null && order.depositRequired !== undefined
        ? order.depositRequired
        : quoted !== null && quoted !== undefined && quoted > 0
            ? quoted * 0.5
            : 0;
    const now = new Date();
    const prevDepositPaidAt = order.depositPaidAt ?? null;
    let depositPaidAt = order.depositPaidAt ?? null;
    let finalPaidAt = order.finalPaidAt ?? null;
    let depositReceived = order.depositReceived;
    let newStatus = order.status;
    const currentSt = String(order.status || "").toUpperCase();
    if (currentSt === "PAID_IN_FULL") {
        newStatus = "PAID_IN_FULL";
    }
    else if (shouldAutoTransitionStatus(order.status)) {
        const fullPaid = quoted !== null &&
            quoted !== undefined &&
            quoted > 0 &&
            newAmountPaid + EPS >= quoted;
        if (fullPaid && canTransitionToPaidInFull(order.status)) {
            newStatus = "PAID_IN_FULL";
            if (!finalPaidAt)
                finalPaidAt = now;
            depositReceived = true;
            if (!depositPaidAt)
                depositPaidAt = now;
        }
        else if (depositReq > 0 &&
            newAmountPaid + EPS >= depositReq &&
            canTransitionToDepositPaid(order.status)) {
            newStatus = "DEPOSIT_PAID";
            if (!depositPaidAt)
                depositPaidAt = now;
            depositReceived = true;
        }
    }
    const updateData = {
        amountPaid: newAmountPaid,
        depositPaidAt,
        finalPaidAt,
        depositReceived,
        status: newStatus,
        squareLastEventId: eventId,
        ...(squareInvStatus != null ? { squareInvoiceStatus: squareInvStatus } : {}),
        ...(squarePayStatus != null ? { squarePaymentStatus: squarePayStatus } : {}),
    };
    try {
        await client_2.db.$transaction(async (tx) => {
            await tx.order.update({
                where: { id: order.id },
                data: updateData,
            });
            await tx.processedWebhookEvent.create({
                data: { id: eventId, eventType },
            });
        });
    }
    catch (e) {
        if (e instanceof client_1.Prisma.PrismaClientKnownRequestError &&
            e.code === "P2002") {
            return { success: true, message: "already processed", orderId: order.id };
        }
        throw e;
    }
    const firstDepositNow = prevDepositPaidAt === null && depositPaidAt !== null;
    const statusForJob = String(newStatus || "").toUpperCase();
    if (firstDepositNow &&
        depositReceived &&
        (statusForJob === "DEPOSIT_PAID" || statusForJob === "PAID_IN_FULL")) {
        try {
            await (0, jobCreationService_1.createJobForDepositedOrder)(order.id);
        }
        catch (jobErr) {
            const jm = jobErr instanceof Error ? jobErr.message : String(jobErr);
            logger_1.logger.warn(`Square webhook: job creation skipped/failed for ${order.id}: ${jm}`);
        }
    }
    if (firstDepositNow && depositReceived) {
        const teamsDep = await (0, teamsNotificationService_1.notifyDepositReceived)(order.id);
        if (teamsDep.success === false) {
            logger_1.logger.warn(`Teams notifyDepositReceived failed for ${order.id}: ${teamsDep.error}`);
        }
    }
    let message = `Processed ${eventType} for order ${order.id}`;
    try {
        await (0, sharepointOrderSync_1.syncOrderToSharePoint)(order.id);
    }
    catch (spErr) {
        const spMsg = spErr instanceof Error ? spErr.message : String(spErr);
        logger_1.logger.warn(`Square webhook: SharePoint sync failed for ${order.id}: ${spMsg}`);
        message += ` SharePoint sync failed: ${spMsg}`;
    }
    return {
        success: true,
        message,
        orderId: order.id,
    };
}
