"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateTasksForOrder = generateTasksForOrder;
const client_1 = require("@prisma/client");
const client_2 = require("../db/client");
const artRoutingService_1 = require("./artRoutingService");
const productionPrintGateService_1 = require("./productionPrintGateService");
const proofRoutingService_1 = require("./proofRoutingService");
const BASE_TASKS = ["Order Blanks", "QC + Pack"];
function normalizePrintMethod(value) {
    if (typeof value !== "string")
        return "";
    return value.trim().toUpperCase().replace(/[_\s-]+/g, "");
}
function tasksForMethod(method) {
    if (method === "DTG")
        return ["Print DTG"];
    if (method === "DTF")
        return ["Print DTF"];
    if (method === "SCREEN")
        return ["Burn Screen", "Print Screen"];
    if (method === "HEATPRESS")
        return ["Press Heat Transfer"];
    return [];
}
function taskTypeForTitle(title) {
    if (title === "Order Blanks")
        return "ORDER_BLANKS";
    if (title === "QC + Pack")
        return "QC_PACK";
    if (title.startsWith("Print ") ||
        title === "Burn Screen" ||
        title.startsWith("Press ")) {
        return "PRINT";
    }
    return "OPS";
}
async function generateTasksForOrder(orderId) {
    const job = await client_2.db.job.findUnique({ where: { orderId } });
    if (!job) {
        return;
    }
    const order = await client_2.db.order.findUnique({
        where: { id: orderId },
        include: {
            lineItems: true,
            tasks: {
                select: { title: true },
            },
        },
    });
    if (!order)
        return;
    const ds = order.depositStatus ?? client_1.OrderDepositStatus.NONE;
    if (ds !== client_1.OrderDepositStatus.PAID && order.depositReceived !== true) {
        return;
    }
    const required = new Set(BASE_TASKS);
    for (const lineItem of order.lineItems ?? []) {
        const li = lineItem;
        const method = normalizePrintMethod(li.printMethod ?? li.productionType ?? "");
        for (const title of tasksForMethod(method)) {
            required.add(title);
        }
    }
    const existingTitles = new Set((order.tasks ?? []).map((task) => task.title));
    const toCreate = [...required].filter((title) => !existingTitles.has(title));
    const blockPrint = (0, productionPrintGateService_1.shouldBlockPrintTasksForOrder)(order);
    if (toCreate.length === 0) {
        try {
            await (0, artRoutingService_1.ensureArtPrepTask)(orderId);
        }
        catch {
            /* non-fatal */
        }
        try {
            await (0, proofRoutingService_1.ensureProofApprovalTask)(orderId);
        }
        catch {
            /* non-fatal */
        }
        return;
    }
    await client_2.db.task.createMany({
        data: toCreate.map((title) => {
            const isPrintStep = title.startsWith("Print ") ||
                title === "Burn Screen" ||
                title.startsWith("Press ");
            return {
                orderId,
                title,
                status: isPrintStep && blockPrint ? "BLOCKED" : "PENDING",
                dueDate: null,
                jobId: job.id,
                type: taskTypeForTitle(title),
            };
        }),
    });
    try {
        await (0, artRoutingService_1.ensureArtPrepTask)(orderId);
    }
    catch {
        /* non-fatal */
    }
    try {
        await (0, proofRoutingService_1.ensureProofApprovalTask)(orderId);
    }
    catch {
        /* non-fatal */
    }
}
