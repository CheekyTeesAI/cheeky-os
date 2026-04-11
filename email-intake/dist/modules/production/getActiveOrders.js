"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getActiveOrders = getActiveOrders;
const dataverseRead_1 = require("./dataverseRead");
const DEFAULT_ENTITY_SET = process.env.DATAVERSE_NEW_ORDERS_ENTITY_SET || "new_orderses";
const DEFAULT_SELECT_FIELDS = [
    "new_ordersid",
    "new_name",
    "new_customername",
    "new_quantitiessummary",
    "new_productiontyperouting",
    "new_duedate",
    "createdon",
    "new_notes",
    "new_orderstage",
    "new_orderstatus",
    "statuscode",
    "statecode"
].join(",");
function parseQtySummary(raw) {
    if (typeof raw === "number" && Number.isFinite(raw)) {
        return Math.max(0, Math.round(raw));
    }
    const s = String(raw ?? "").trim();
    const nums = s.match(/\d+/g);
    if (!nums || nums.length === 0)
        return 0;
    const total = nums.reduce((acc, n) => acc + parseInt(n, 10), 0);
    return Math.max(0, total);
}
function mapProductionType(row) {
    const logical = "new_productiontyperouting";
    const label = (0, dataverseRead_1.formattedChoice)(row, logical) ||
        String((0, dataverseRead_1.pick)(row, "new_productiontyperouting") ?? "").toLowerCase();
    const combined = label.toLowerCase();
    if (combined.includes("dtf"))
        return "DTF";
    if (combined.includes("screen") || combined.includes("silk"))
        return "ScreenPrint";
    const code = (0, dataverseRead_1.pick)(row, "new_productiontyperouting");
    if (typeof code === "number") {
        if (code === 100000001)
            return "DTF";
        if (code === 100000002)
            return "ScreenPrint";
    }
    return "DTG";
}
function rowDueDate(row) {
    const v = (0, dataverseRead_1.pick)(row, "createdon", "new_duedate", "new_requesteddelivery");
    if (typeof v === "string" && v.length >= 10) {
        return v.slice(0, 10);
    }
    return null;
}
function notesRush(row) {
    const notes = String((0, dataverseRead_1.pick)(row, "new_notes", "description") ?? "").toLowerCase();
    return notes.includes("rush");
}
function mapSystemStatus(row) {
    const stageLabel = String((0, dataverseRead_1.formattedChoice)(row, "new_orderstage") ||
        (0, dataverseRead_1.formattedChoice)(row, "new_orderstatus") ||
        (0, dataverseRead_1.pick)(row, "new_orderstage", "new_orderstatus", "statuscode") ||
        "").toLowerCase();
    if (stageLabel.includes("complete"))
        return "Completed";
    if (stageLabel.includes("printing") || stageLabel.includes("production"))
        return "Printing";
    if (stageLabel.includes("ready"))
        return "Production Ready";
    if (stageLabel.includes("deposit"))
        return "Deposit Paid";
    if (stageLabel.includes("quote"))
        return "Quote Sent";
    if (stageLabel.includes("intake") || stageLabel.includes("new"))
        return "Intake";
    const code = (0, dataverseRead_1.pick)(row, "new_orderstage", "new_orderstatus", "statuscode");
    if (code === 100000003)
        return "Completed";
    if (code === 100000002)
        return "Printing";
    if (code === 100000001)
        return "Deposit Paid";
    return "Intake";
}
function isCompletedRow(row) {
    const statusLabel = String((0, dataverseRead_1.formattedChoice)(row, "new_orderstage") ||
        (0, dataverseRead_1.formattedChoice)(row, "new_orderstatus") ||
        (0, dataverseRead_1.formattedChoice)(row, "new_status") ||
        (0, dataverseRead_1.pick)(row, "new_orderstatusname", "new_statusname", "new_orderstatus", "new_status") ||
        "").toLowerCase();
    if (statusLabel.includes("complete"))
        return true;
    const code = (0, dataverseRead_1.pick)(row, "new_orderstage", "new_orderstatus", "new_status", "statuscode");
    if (code === 100000003)
        return true;
    const state = (0, dataverseRead_1.pick)(row, "statecode");
    if (state === 1)
        return true;
    return false;
}
function rowToJob(row) {
    const orderName = String((0, dataverseRead_1.pick)(row, "new_name", "new_ordername") ?? "").trim();
    const customer = String((0, dataverseRead_1.pick)(row, "new_customername", "new_customer") ?? "").trim();
    const orderId = String((0, dataverseRead_1.pick)(row, "new_ordersid", "activityid", "new_orderid") ?? "").trim();
    const notesRaw = (0, dataverseRead_1.pick)(row, "new_notes", "description");
    const name = orderName ||
        customer ||
        `Order ${orderId.slice(-8) || "active"}`;
    return {
        id: orderId || `order-${name.replace(/\s+/g, "-").toLowerCase()}`,
        name,
        customerName: customer || null,
        status: mapSystemStatus(row),
        stage: String((0, dataverseRead_1.formattedChoice)(row, "new_orderstage") || "").trim() || null,
        dueDate: rowDueDate(row),
        type: mapProductionType(row),
        qty: Math.max(0, parseQtySummary((0, dataverseRead_1.pick)(row, "new_quantitiessummary"))),
        notes: typeof notesRaw === "string" && notesRaw.trim() ? notesRaw.trim() : null,
        rush: notesRush(row)
    };
}
/**
 * Returns active `new_orders` rows (status ≠ Completed) normalized for production scheduling.
 * On any failure or missing config → `[]`.
 */
async function getActiveOrders() {
    try {
        const select = process.env.DATAVERSE_NEW_ORDERS_SELECT?.trim() || DEFAULT_SELECT_FIELDS;
        const rows = await (0, dataverseRead_1.dataverseReadAll)(DEFAULT_ENTITY_SET, select);
        return rows
            .filter((r) => (0, dataverseRead_1.pick)(r, "statecode") !== 1)
            .filter((r) => !isCompletedRow(r))
            .map(rowToJob);
    }
    catch {
        return [];
    }
}
