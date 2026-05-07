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
exports.extractSquarePaymentId = extractSquarePaymentId;
exports.processSquareWebhook = processSquareWebhook;
const crypto_1 = require("crypto");
const client_1 = require("@prisma/client");
const client_2 = require("../db/client");
const paymentStateNormalizer_1 = require("../lib/paymentStateNormalizer");
const squareOrderStateSync_1 = require("../lib/squareOrderStateSync");
const logger_1 = require("../utils/logger");
const jobCreationService_1 = require("./jobCreationService");
const sharepointOrderSync_1 = require("./sharepointOrderSync");
const teamsNotificationService_1 = require("./teamsNotificationService");
/**
 * CHEEKY OS v1.0 — Intake quoting (`ct_intake_queue` / QUOTE_PENDING) is **not** handled here.
 * Payment-only pipeline. For ChatGPT structured quotes use:
 * - `cheeky-os/services/openaiQuoteIntake.service.js` + `POST /api/cheeky-intake/quote-parse`, and/or
 * - Power Automate + `connectors/openai-chat-completions-v1.openapi.yaml`.
 */
// Cheeky OS v3.2 — decision engine (same transaction as money + idempotency ledger).
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pathMod = require("path");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { runDecisionEngineInTransaction } = require(pathMod.join(__dirname, "..", "..", "..", "src", "services", "decisionEngine.js"));
const EPS = 1e-6;
let warnedSkipVerify = false;
/**
 * Square: HMAC-SHA256(signatureKey, notificationUrl + rawBody), compare to
 * `x-square-hmacsha256-signature` (base64). See:
 * https://developer.squareup.com/docs/webhooks/step3validate
 *
 * - If `SQUARE_WEBHOOK_SIGNATURE_SKIP_VERIFY=true`: skip (logs once).
 * - If `SQUARE_WEBHOOK_SIGNATURE_KEY` is unset: no-op (backward compatible).
 * - If key is set: require signature header and notification URL; throw on failure.
 *
 * `notificationUrl` must match the webhook subscription URL (scheme + host + path).
 * Set `SQUARE_WEBHOOK_NOTIFICATION_URL` when behind proxies or for a fixed public URL.
 *
 * Parsed JSON bodies use `JSON.stringify(req.body)`; bytes may not match Square's exact
 * payload — prefer a raw-body endpoint for strict production verification.
 */
function verifySquareSignature(rawBody, signatureHeader, notificationUrl) {
    if (process.env.SQUARE_WEBHOOK_SIGNATURE_SKIP_VERIFY === "true") {
        if (!warnedSkipVerify) {
            warnedSkipVerify = true;
            logger_1.logger.warn("Square webhook: signature verification skipped (SQUARE_WEBHOOK_SIGNATURE_SKIP_VERIFY=true)");
        }
        return;
    }
    const key = (process.env.SQUARE_WEBHOOK_SIGNATURE_KEY || "").trim();
    if (!key) {
        return;
    }
    const explicitUrl = (process.env.SQUARE_WEBHOOK_NOTIFICATION_URL || "").trim();
    const url = (explicitUrl || notificationUrl || "").trim();
    if (!url) {
        throw new Error("Square webhook: set SQUARE_WEBHOOK_NOTIFICATION_URL (or caller must pass notificationUrl) when SQUARE_WEBHOOK_SIGNATURE_KEY is set");
    }
    if (!signatureHeader || !signatureHeader.trim()) {
        throw new Error("Square webhook: missing x-square-hmacsha256-signature header");
    }
    const body = typeof rawBody === "string" ? rawBody : rawBody.toString("utf8");
    const payload = `${url}${body}`;
    const digest = (0, crypto_1.createHmac)("sha256", key)
        .update(payload, "utf8")
        .digest("base64");
    const sig = signatureHeader.trim();
    const a = Buffer.from(digest, "utf8");
    const b = Buffer.from(sig, "utf8");
    if (a.length !== b.length || !(0, crypto_1.timingSafeEqual)(a, b)) {
        throw new Error("Invalid Square webhook signature");
    }
    logger_1.logger.info("[square-webhook] phase=signature_verified");
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
/** Square payment id from webhook `data.object.payment.id` (payment.updated). */
function extractSquarePaymentId(payload) {
    const obj = getDataObject(payload);
    const pay = asRecord(obj?.payment);
    const raw = pay?.id ?? pay?.payment_id;
    return typeof raw === "string" && raw.trim() ? raw.trim() : null;
}
function round2(n) {
    return Math.round(n * 100) / 100;
}
function paymentIndicatesMoneyCollected(payload) {
    const raw = extractPaymentStatus(payload);
    const n = (0, paymentStateNormalizer_1.normalizeSquarePaymentStatus)(raw);
    return (0, paymentStateNormalizer_1.isSquarePaymentCollected)(n);
}
function canTransitionToDepositPaid(status) {
    const s = status.toUpperCase();
    return [
        "INTAKE",
        "QUOTE_SENT",
        "QUOTE_READY",
        "APPROVED",
        "INVOICE_DRAFTED",
        "AWAITING_DEPOSIT",
    ].includes(s);
}
function canTransitionToPaidInFull(status) {
    const s = status.toUpperCase();
    if (s === "PAID_IN_FULL")
        return false;
    return [
        "DEPOSIT_PAID",
        "PRODUCTION_READY",
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
/** Apply deposit / production-stage transitions for any non-terminal order (incl. INTAKE). */
function canApplyDepositMoneyTransition(status) {
    const s = String(status || "").toUpperCase();
    return !["BLOCKED", "CANCELLED", "PAID_IN_FULL"].includes(s);
}
/**
 * Invoice / payment webhook pipeline (invoice.updated, payment.updated, etc.).
 *
 * **Idempotency:** Square may retry deliveries. We key on Square's top-level
 * `event_id` (see `extractEventId`) in `ProcessedWebhookEvent.id`. First
 * delivery runs the order update + ledger insert in one transaction; duplicates
 * return `{ success: true, message: "already processed" }` so HTTP handlers can
 * respond 200 without re-applying money or side effects. Races use P2002 handling.
 *
 * **No matching order:** We do not record a ledger row (so a later fix to order
 * linkage can still allow a different event to match). Retries of the same
 * no-match payload repeat the lookup — they do not mutate payment state.
 */
async function processSquareWebhook(payload) {
    const eventId = extractEventId(payload);
    if (!eventId) {
        logger_1.logger.warn("[square-webhook] phase=reject reason=missing_event_id");
        return { success: false, message: "Missing webhook event id" };
    }
    const eventType = extractEventType(payload) ?? "unknown";
    const existing = await client_2.db.processedWebhookEvent.findUnique({
        where: { id: eventId },
    });
    if (existing) {
        logger_1.logger.info(`[square-webhook] phase=duplicate_skip eventId=${eventId} eventType=${eventType}`);
        return { success: true, message: "already processed" };
    }
    logger_1.logger.info(`[square-webhook] phase=process_start eventId=${eventId} eventType=${eventType}`);
    const invoiceId = extractInvoiceId(payload);
    const sqOrderId = extractSquareOrderId(payload);
    const invoiceNumber = extractInvoiceNumber(payload);
    const sqPaymentId = extractSquarePaymentId(payload);
    let order = invoiceId ?
        await client_2.db.order.findFirst({ where: { squareInvoiceId: invoiceId } })
        : null;
    if (!order && sqOrderId) {
        order = await client_2.db.order.findFirst({ where: { squareOrderId: sqOrderId } });
    }
    if (!order && sqPaymentId) {
        order = await client_2.db.order.findFirst({ where: { squareId: sqPaymentId } });
    }
    if (!order && invoiceNumber) {
        order = await client_2.db.order.findFirst({
            where: { squareInvoiceNumber: invoiceNumber },
        });
    }
    if (!order) {
        logger_1.logger.warn(`[square-webhook] phase=no_order_match eventId=${eventId} eventType=${eventType} invoiceId=${invoiceId ?? "none"} sqOrderId=${sqOrderId ?? "none"} sqPaymentId=${sqPaymentId ?? "none"} invoiceNumber=${invoiceNumber ?? "none"}`);
        let intakeMirrored = 0;
        try {
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            const bridge = require(pathMod.join(__dirname, "..", "..", "cheeky-os", "services", "intakeSquareBridge.service"));
            const mr = await bridge.tryMirrorIntakeDepositFromWebhookPayload(payload);
            intakeMirrored = mr.rows && mr.rows > 0 ? mr.rows : 0;
            if (!mr.ok && mr.error)
                logger_1.logger.warn(`[square-webhook] intake mirror error: ${mr.error}`);
        }
        catch (imErr) {
            const imx = imErr instanceof Error ? imErr.message : String(imErr);
            logger_1.logger.warn(`[square-webhook] intake deposit mirror skipped: ${imx}`);
        }
        if (intakeMirrored > 0) {
            await client_2.db.processedWebhookEvent.create({
                data: { id: eventId, eventType },
            });
            logger_1.logger.info(`[square-webhook] phase=intake_only_mirror_rows=${intakeMirrored} eventId=${eventId}`);
            return {
                success: true,
                message: `No Prisma order; mirrored Dataverse intake deposit (${intakeMirrored} row(s))`,
            };
        }
        return {
            success: false,
            message: "No matching order for invoice/order/invoice number in payload (and no Dataverse intake mirror)",
        };
    }
    logger_1.logger.info(`[square-webhook] matched_order orderId=${order.id} sqPaymentId=${sqPaymentId ?? "none"} invoiceId=${invoiceId ?? "none"} sqOrderId=${sqOrderId ?? "none"}`);
    const squareInvStatus = extractInvoiceStatus(payload);
    const squarePayStatus = extractPaymentStatus(payload);
    const normPay = (0, paymentStateNormalizer_1.normalizeSquarePaymentStatus)(squarePayStatus);
    const normInv = (0, paymentStateNormalizer_1.normalizeSquareInvoiceStatus)(squareInvStatus);
    if ((squarePayStatus && normPay === "UNKNOWN") ||
        (squareInvStatus && normInv === "UNKNOWN")) {
        logger_1.logger.info(`[square-webhook] phase=status_normalized_unknown rawPay=${String(squarePayStatus).slice(0, 64)} rawInv=${String(squareInvStatus).slice(0, 64)} normPay=${normPay} normInv=${normInv}`);
    }
    let newAmountPaid = round2(order.amountPaid ?? 0);
    if (eventType === "payment.updated") {
        const add = extractPaymentAmountDollars(payload);
        if (add !== null && add > 0 && paymentIndicatesMoneyCollected(payload)) {
            newAmountPaid = round2(newAmountPaid + add);
        }
    }
    if (eventType === "invoice.updated" || eventType === "invoice.payment_made") {
        const invPaid = extractInvoiceAmountPaidDollars(payload);
        if (invPaid !== null && invPaid > 0) {
            newAmountPaid = round2(Math.max(newAmountPaid, invPaid));
        }
    }
    const quoted = order.quotedAmount;
    const totalAmt = order.totalAmount ?? 0;
    const depositReq = order.depositRequired !== null &&
        order.depositRequired !== undefined &&
        order.depositRequired > 0
        ? round2(Number(order.depositRequired))
        : totalAmt > 0
            ? round2(totalAmt * 0.5)
            : quoted !== null && quoted !== undefined && quoted > 0
                ? round2(quoted * 0.5)
                : 0;
    const now = new Date();
    const prevDepositPaidAt = order.depositPaidAt ?? null;
    let depositPaidAt = order.depositPaidAt ?? null;
    let finalPaidAt = order.finalPaidAt ?? null;
    let depositReceived = order.depositReceived;
    let newStatus = order.status;
    const prevDepositStatus = order.depositStatus ?? client_1.OrderDepositStatus.NONE;
    let newDepositStatus = prevDepositStatus;
    const currentSt = String(order.status || "").toUpperCase();
    if (currentSt === "PAID_IN_FULL") {
        newStatus = "PAID_IN_FULL";
        newDepositStatus = client_1.OrderDepositStatus.PAID;
        depositReceived = true;
    }
    else if (canApplyDepositMoneyTransition(order.status)) {
        const fullPaid = quoted !== null &&
            quoted !== undefined &&
            quoted > 0 &&
            newAmountPaid + EPS >= quoted;
        if (fullPaid && canTransitionToPaidInFull(order.status)) {
            newStatus = "PAID_IN_FULL";
            newDepositStatus = client_1.OrderDepositStatus.PAID;
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
            newDepositStatus = client_1.OrderDepositStatus.PAID;
            if (!depositPaidAt)
                depositPaidAt = now;
            depositReceived = true;
        }
        else if (depositReq <= EPS && newAmountPaid > EPS) {
            newStatus = "DEPOSIT_PAID";
            newDepositStatus = client_1.OrderDepositStatus.PAID;
            if (!depositPaidAt)
                depositPaidAt = now;
            depositReceived = true;
        }
        else if (newAmountPaid > EPS) {
            newDepositStatus = client_1.OrderDepositStatus.PARTIAL;
            depositReceived = false;
            const lockDowngrade = new Set([
                "PRODUCTION_READY",
                "PRINTING",
                "QC",
                "COMPLETED",
                "PAID_IN_FULL",
                "DEPOSIT_PAID",
            ]);
            if (!lockDowngrade.has(currentSt)) {
                newStatus = "AWAITING_DEPOSIT";
            }
        }
        else {
            newDepositStatus = client_1.OrderDepositStatus.NONE;
            depositReceived = false;
        }
    }
    const moneySync = (0, squareOrderStateSync_1.buildSquareWebhookMoneySyncView)({
        payload,
        eventType,
        squarePayStatus,
        squareInvStatus,
        normPay,
        normInv,
        invoiceId,
        sqOrderId,
        invoiceNumber,
        newAmountPaid,
        order: {
            quotedAmount: order.quotedAmount ?? null,
            depositAmount: order.depositAmount ?? null,
            squareId: order.squareId ?? null,
        },
    });
    logger_1.logger.info(`[square-webhook] phase=money_sync ${(0, squareOrderStateSync_1.compactSyncLogLine)(moneySync)}`);
    const updateData = {
        amountPaid: newAmountPaid,
        depositPaid: newDepositStatus === client_1.OrderDepositStatus.PAID ||
            newStatus === "PAID_IN_FULL",
        depositStatus: newDepositStatus,
        depositPaidAt,
        finalPaidAt,
        depositReceived,
        status: newStatus,
        squareLastEventId: eventId,
        ...(sqPaymentId && !order.squareId ? { squareId: sqPaymentId } : {}),
        ...(squareInvStatus != null ? { squareInvoiceStatus: squareInvStatus } : {}),
        ...(squarePayStatus != null ? { squarePaymentStatus: squarePayStatus } : {}),
    };
    try {
        await client_2.db.$transaction(async (tx) => {
            await tx.order.update({
                where: { id: order.id },
                data: updateData,
            });
            await runDecisionEngineInTransaction(tx, order.id);
            await tx.processedWebhookEvent.create({
                data: { id: eventId, eventType },
            });
        });
    }
    catch (e) {
        if (e instanceof client_1.Prisma.PrismaClientKnownRequestError &&
            e.code === "P2002") {
            logger_1.logger.info(`[square-webhook] phase=duplicate_skip_race eventId=${eventId} eventType=${eventType} orderId=${order.id}`);
            return { success: true, message: "already processed", orderId: order.id };
        }
        throw e;
    }
    try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const bridge = require(pathMod.join(__dirname, "..", "..", "cheeky-os", "services", "intakeSquareBridge.service"));
        const imx = await bridge.tryMirrorIntakeDepositFromWebhookPayload(payload);
        if (imx.rows && imx.rows > 0) {
            logger_1.logger.info(`[square-webhook] phase=dataverse_intake_deposit_mirror rows=${imx.rows}`);
        }
    }
    catch (dvIxErr) {
        const em = dvIxErr instanceof Error ? dvIxErr.message : String(dvIxErr);
        logger_1.logger.warn(`[square-webhook] dataverse intake mirror: ${em}`);
    }
    const becameDepositPaid = prevDepositStatus !== client_1.OrderDepositStatus.PAID &&
        newDepositStatus === client_1.OrderDepositStatus.PAID;
    const firstDepositNow = prevDepositPaidAt === null && depositPaidAt !== null;
    if (becameDepositPaid && depositReceived) {
        try {
            await (0, jobCreationService_1.ensureJobShellForDepositedOrder)(order.id);
        }
        catch (jobErr) {
            const jm = jobErr instanceof Error ? jobErr.message : String(jobErr);
            logger_1.logger.warn(`Square webhook: job shell skipped/failed for ${order.id}: ${jm}`);
        }
    }
    if (becameDepositPaid && depositReceived) {
        logger_1.logger.info(`[flow] CASH GATE PASSED orderId=${order.id}`);
    }
    if (firstDepositNow && depositReceived) {
        try {
            const draft = require(pathMod.join(__dirname, "..", "..", "cheeky-os", "services", "customerMessageDraft.service"));
            if (draft && typeof draft.persistDraftMessage === "function") {
                void draft.persistDraftMessage(order.id, "DEPOSIT_RECEIVED", "email");
            }
        }
        catch {
            /* optional draft */
        }
        const teamsDep = await (0, teamsNotificationService_1.notifyDepositReceived)(order.id);
        if (teamsDep.success === false) {
            logger_1.logger.warn(`Teams notifyDepositReceived failed for ${order.id}: ${teamsDep.error}`);
        }
    }
    const afterOrder = await client_2.db.order.findUnique({ where: { id: order.id } });
    if (afterOrder) {
        const st = String(afterOrder.status || "").toUpperCase();
        if (st === "PRODUCTION_READY" && afterOrder.garmentsOrdered !== true) {
            logger_1.logger.info(`[flow] PRODUCTION READY orderId=${order.id}`);
            if (String(process.env.CHEEKY_AUTO_GARMENT_ORDER_ON_DEPOSIT || "")
                .trim()
                .toLowerCase() === "true") {
                try {
                    // eslint-disable-next-line @typescript-eslint/no-require-imports
                    const gmod = require(pathMod.join(__dirname, "garmentOrderingService"));
                    const createGarmentOrderForOrder = gmod.createGarmentOrderForOrder;
                    const go = await createGarmentOrderForOrder(order.id);
                    logger_1.logger.info(`[flow] GARMENT ORDER CREATED orderId=${order.id} result=${JSON.stringify(go).slice(0, 200)}`);
                }
                catch (goErr) {
                    const gm = goErr instanceof Error ? goErr.message : String(goErr);
                    logger_1.logger.warn(`[flow] GARMENT ORDER skipped/failed orderId=${order.id}: ${gm}`);
                }
            }
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
    logger_1.logger.info(`[square-webhook] phase=complete success=true eventId=${eventId} orderId=${order.id} eventType=${eventType}`);
    return {
        success: true,
        message,
        orderId: order.id,
    };
}
