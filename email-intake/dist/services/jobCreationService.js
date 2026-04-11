"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OrderNotEligibleForJobError = void 0;
exports.createJobForDepositedOrder = createJobForDepositedOrder;
const client_1 = require("../db/client");
const logger_1 = require("../utils/logger");
const orderEvaluator_1 = require("./orderEvaluator");
const sharepointOrderSync_1 = require("./sharepointOrderSync");
const teamsNotificationService_1 = require("./teamsNotificationService");
const digitizingService_1 = require("./digitizingService");
const productionRoutingService_1 = require("./productionRoutingService");
const safetyGuard_service_1 = require("./safetyGuard.service");
const INITIAL_TASKS = [
    {
        title: "Review artwork and order details",
        type: "ART_REVIEW",
    },
    {
        title: "Order garments / confirm blanks",
        type: "ORDER_GARMENTS",
    },
    {
        title: "Prepare production setup",
        type: "PREP_PRODUCTION",
    },
];
class OrderNotEligibleForJobError extends Error {
    constructor(message) {
        super(message);
        this.name = "OrderNotEligibleForJobError";
    }
}
exports.OrderNotEligibleForJobError = OrderNotEligibleForJobError;
async function createJobForDepositedOrder(orderId) {
    const order = await client_1.db.order.findUnique({ where: { id: orderId } });
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
        return {
            success: true,
            job: existing,
            tasksCreated: 0,
            message: "Job already exists",
        };
    }
    (0, safetyGuard_service_1.assertActionAllowed)(order, "CREATE_JOB");
    const productionType = order.printMethod ?? "DTG";
    const now = new Date();
    const nextOrderStatus = st === "PAID_IN_FULL" ? order.status : "PRODUCTION_READY";
    const result = await client_1.db.$transaction(async (tx) => {
        const job = await tx.job.create({
            data: {
                orderId,
                status: "PRODUCTION_READY",
                productionType,
                notes: order.notes || null,
            },
        });
        await tx.task.createMany({
            data: INITIAL_TASKS.map((t) => ({
                jobId: job.id,
                title: t.title,
                type: t.type,
                status: "TODO",
            })),
        });
        await tx.order.update({
            where: { id: orderId },
            data: {
                jobCreated: true,
                jobCreatedAt: now,
                status: nextOrderStatus,
                productionStatus: "PRODUCTION_READY",
            },
        });
        const full = await tx.job.findUniqueOrThrow({
            where: { id: job.id },
            include: { tasks: true },
        });
        return full;
    });
    try {
        await (0, sharepointOrderSync_1.syncOrderToSharePoint)(orderId);
    }
    catch (spErr) {
        const spMsg = spErr instanceof Error ? spErr.message : String(spErr);
        logger_1.logger.warn(`jobCreationService: SharePoint sync failed for ${orderId}: ${spMsg}`);
    }
    const teamsProd = await (0, teamsNotificationService_1.notifyProductionReady)(orderId);
    if (teamsProd.success === false) {
        logger_1.logger.warn(`Teams notifyProductionReady failed for ${orderId}: ${teamsProd.error}`);
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
    return {
        success: true,
        job: result,
        tasksCreated: INITIAL_TASKS.length,
    };
}
