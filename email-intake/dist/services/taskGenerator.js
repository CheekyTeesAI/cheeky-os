"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateTasksForOrder = generateTasksForOrder;
const client_1 = require("../db/client");
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
async function generateTasksForOrder(orderId) {
    const order = await client_1.db.order.findUnique({
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
    if (toCreate.length === 0)
        return;
    await client_1.db.task.createMany({
        data: toCreate.map((title) => ({
            orderId,
            title,
            status: "PENDING",
            dueDate: null,
        })),
    });
}
