"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OrderNotEligibleForJobError = void 0;
exports.ensureJobShellForDepositedOrder = ensureJobShellForDepositedOrder;
exports.createJobForDepositedOrder = createJobForDepositedOrder;
const productionQueue_1 = require("../lib/productionQueue");
const client_1 = require("../db/client");
const logger_1 = require("../utils/logger");
const orderEvaluator_1 = require("./orderEvaluator");
const sharepointOrderSync_1 = require("./sharepointOrderSync");
const digitizingService_1 = require("./digitizingService");
const productionRoutingService_1 = require("./productionRoutingService");
const safetyGuard_service_1 = require("./safetyGuard.service");
const garmentOrderFlowService_1 = require("./garmentOrderFlowService");
const artRoutingService_1 = require("./artRoutingService");
const proofRoutingService_1 = require("./proofRoutingService");
const MINIMAL_PRODUCTION_TASKS = [
    { title: "Art review", type: "ART_REVIEW" },
    { title: "Garment order", type: "GARMENT_ORDER" },
    { title: "Print prep", type: "PRINT_PREP" },
];
/** @deprecated Use MINIMAL_PRODUCTION_TASKS — kept name for routing scripts that import count */
const INITIAL_TASKS = MINIMAL_PRODUCTION_TASKS;
class OrderNotEligibleForJobError extends Error {
    constructor(message) {
        super(message);
        this.name = "OrderNotEligibleForJobError";
    }
}
exports.OrderNotEligibleForJobError = OrderNotEligibleForJobError;
/**
 * Deposit webhook: create Job shell + order production fields only — no tasks, no production notifications.
 */
async function ensureJobShellForDepositedOrder(orderId) {
    const order = await client_1.db.order.findUnique({
        where: { id: orderId },
        include: { lineItems: true },
    });
    if (!order) {
        throw new orderEvaluator_1.OrderNotFoundError(orderId);
    }
    const existing = await client_1.db.job.findUnique({
        where: { orderId },
        include: { tasks: true },
    });
    if (existing) {
        return {
            success: true,
            job: existing,
            tasksCreated: 0,
            message: "job_shell_exists",
        };
    }
    (0, safetyGuard_service_1.assertActionAllowed)(order, "CREATE_JOB");
    const productionType = order.printMethod ?? "DTG";
    const initialQueue = (0, productionQueue_1.persistedQueueStatusForNormalized)(productionQueue_1.INITIAL_PRODUCTION_QUEUE_STATE);
    const garmentFields = (0, garmentOrderFlowService_1.buildPostDepositGarmentFields)(order);
    const now = new Date();
    const full = await client_1.db.$transaction(async (tx) => {
        const job = await tx.job.create({
            data: {
                orderId,
                status: initialQueue,
                productionType,
                notes: order.notes || null,
            },
        });
        await tx.order.update({
            where: { id: orderId },
            data: {
                jobCreated: true,
                jobCreatedAt: now,
                productionStatus: initialQueue,
                ...garmentFields,
            },
        });
        return tx.job.findUniqueOrThrow({
            where: { id: job.id },
            include: { tasks: true },
        });
    });
    logger_1.logger.info(`jobCreationService: job shell only order=${orderId}`);
    try {
        await (0, sharepointOrderSync_1.syncOrderToSharePoint)(orderId);
    }
    catch (spErr) {
        const spMsg = spErr instanceof Error ? spErr.message : String(spErr);
        logger_1.logger.warn(`jobCreationService: SharePoint sync failed for ${orderId}: ${spMsg}`);
    }
    return {
        success: true,
        job: full,
        tasksCreated: 0,
        message: "job_shell_created",
    };
}
async function createJobForDepositedOrder(orderId) {
    const order = await client_1.db.order.findUnique({
        where: { id: orderId },
        include: { lineItems: true },
    });
    if (!order) {
        throw new orderEvaluator_1.OrderNotFoundError(orderId);
    }
    const st = String(order.status || "").toUpperCase();
    const existing = await client_1.db.job.findUnique({
        where: { orderId },
        include: { tasks: true },
    });
    if (existing) {
        try {
            await (0, productionRoutingService_1.routeProductionForOrder)(orderId);
        }
        catch (routeErr) {
            const rMsg = routeErr instanceof Error ? routeErr.message : String(routeErr);
            logger_1.logger.warn(`jobCreationService: production routing hook failed for ${orderId}: ${rMsg}`);
        }
        try {
            await (0, artRoutingService_1.ensureArtPrepTask)(orderId);
        }
        catch (artErr) {
            const aMsg = artErr instanceof Error ? artErr.message : String(artErr);
            logger_1.logger.warn(`jobCreationService: ensureArtPrepTask ${orderId}: ${aMsg}`);
        }
        try {
            await (0, proofRoutingService_1.ensureProofApprovalTask)(orderId);
        }
        catch (pErr) {
            const pMsg = pErr instanceof Error ? pErr.message : String(pErr);
            logger_1.logger.warn(`jobCreationService: ensureProofApprovalTask ${orderId}: ${pMsg}`);
        }
        return {
            success: true,
            job: existing,
            tasksCreated: 0,
            message: "Job already exists",
        };
    }
    if (st === "DEPOSIT_PAID") {
        return ensureJobShellForDepositedOrder(orderId);
    }
    (0, safetyGuard_service_1.assertActionAllowed)(order, "CREATE_JOB");
    const productionType = order.printMethod ?? "DTG";
    const now = new Date();
    const nextOrderStatus = st === "PAID_IN_FULL" ? order.status : "PRODUCTION_READY";
    const initialQueue = (0, productionQueue_1.persistedQueueStatusForNormalized)(productionQueue_1.INITIAL_PRODUCTION_QUEUE_STATE);
    const garmentFields = (0, garmentOrderFlowService_1.buildPostDepositGarmentFields)(order);
    const result = await client_1.db.$transaction(async (tx) => {
        const job = await tx.job.create({
            data: {
                orderId,
                status: initialQueue,
                productionType,
                notes: order.notes || null,
            },
        });
        const orderLabel = order.orderNumber || orderId.slice(0, 8);
        await tx.task.createMany({
            data: INITIAL_TASKS.map((t) => {
                const title = t.type === "GARMENT_ORDER"
                    ? `Order garments for Order #${orderLabel}`
                    : t.title;
                return {
                    orderId,
                    jobId: job.id,
                    title,
                    type: t.type,
                    status: "PENDING",
                };
            }),
        });
        await tx.order.update({
            where: { id: orderId },
            data: {
                jobCreated: true,
                jobCreatedAt: now,
                status: nextOrderStatus,
                productionStatus: initialQueue,
                ...garmentFields,
            },
        });
        const full = await tx.job.findUniqueOrThrow({
            where: { id: job.id },
            include: { tasks: true },
        });
        return full;
    });
    const queueView = (0, productionQueue_1.describeProductionQueue)(initialQueue, { updatedAt: now });
    const stepCheck = (0, productionQueue_1.transitionProductionQueueState)(initialQueue, productionQueue_1.INITIAL_PRODUCTION_QUEUE_STATE);
    if (!stepCheck.allowed) {
        logger_1.logger.warn(`jobCreationService: queue idempotent check failed for ${orderId}: ${stepCheck.reason}`);
    }
    else {
        logger_1.logger.info(`jobCreationService: production queue lane=${queueView.normalizedState} label=${queueView.displayLabel} order=${orderId}`);
    }
    try {
        await (0, sharepointOrderSync_1.syncOrderToSharePoint)(orderId);
    }
    catch (spErr) {
        const spMsg = spErr instanceof Error ? spErr.message : String(spErr);
        logger_1.logger.warn(`jobCreationService: SharePoint sync failed for ${orderId}: ${spMsg}`);
    }
    const printU = String(order.printMethod ?? "").toUpperCase();
    if (printU.includes("EMB")) {
        try {
            await (0, digitizingService_1.createDigitizingRequestForOrder)(orderId);
        }
        catch (digErr) {
            const dMsg = digErr instanceof Error ? digErr.message : String(digErr);
            logger_1.logger.warn(`jobCreationService: digitizing hook failed for ${orderId}: ${dMsg}`);
        }
    }
    try {
        await (0, productionRoutingService_1.routeProductionForOrder)(orderId);
    }
    catch (routeErr) {
        const rMsg = routeErr instanceof Error ? routeErr.message : String(routeErr);
        logger_1.logger.warn(`jobCreationService: production routing hook failed for ${orderId}: ${rMsg}`);
    }
    try {
        await (0, artRoutingService_1.ensureArtPrepTask)(orderId);
    }
    catch (artErr) {
        const aMsg = artErr instanceof Error ? artErr.message : String(artErr);
        logger_1.logger.warn(`jobCreationService: ensureArtPrepTask ${orderId}: ${aMsg}`);
    }
    try {
        await (0, proofRoutingService_1.ensureProofApprovalTask)(orderId);
    }
    catch (pErr) {
        const pMsg = pErr instanceof Error ? pErr.message : String(pErr);
        logger_1.logger.warn(`jobCreationService: ensureProofApprovalTask ${orderId}: ${pMsg}`);
    }
    return {
        success: true,
        job: result,
        tasksCreated: INITIAL_TASKS.length,
    };
}
