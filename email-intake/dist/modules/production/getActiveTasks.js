"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getActiveTasks = getActiveTasks;
const dataverseRead_1 = require("./dataverseRead");
const DEFAULT_ENTITY_SET = process.env.DATAVERSE_TASKS_ENTITY_SET || "tasks";
const SELECT_FIELDS = [
    "activityid",
    "subject",
    "_regardingobjectid_value",
    "_ownerid_value",
    "scheduledend",
    "statuscode",
    "statecode"
].join(",");
function isCompletedTask(row) {
    const label = String((0, dataverseRead_1.formattedChoice)(row, "statuscode") ||
        (0, dataverseRead_1.formattedChoice)(row, "statecode") ||
        (0, dataverseRead_1.pick)(row, "statuscode", "statecode") ||
        "").toLowerCase();
    if (label.includes("complete"))
        return true;
    return (0, dataverseRead_1.pick)(row, "statecode") === 1;
}
function toTask(row) {
    const dueRaw = (0, dataverseRead_1.pick)(row, "scheduledend");
    const dueDate = typeof dueRaw === "string" && dueRaw.length >= 10 ? dueRaw.slice(0, 10) : null;
    return {
        id: String((0, dataverseRead_1.pick)(row, "activityid") ?? ""),
        taskName: String((0, dataverseRead_1.pick)(row, "subject") ?? "Task"),
        relatedOrder: (0, dataverseRead_1.formattedChoice)(row, "_regardingobjectid_value") ||
            ((0, dataverseRead_1.pick)(row, "_regardingobjectid_value")
                ? String((0, dataverseRead_1.pick)(row, "_regardingobjectid_value"))
                : null),
        assignedTo: (0, dataverseRead_1.formattedChoice)(row, "_ownerid_value") ||
            ((0, dataverseRead_1.pick)(row, "_ownerid_value") ? String((0, dataverseRead_1.pick)(row, "_ownerid_value")) : null),
        dueDate,
        status: (0, dataverseRead_1.formattedChoice)(row, "statuscode") ||
            (0, dataverseRead_1.formattedChoice)(row, "statecode") ||
            ((0, dataverseRead_1.pick)(row, "statuscode") ? String((0, dataverseRead_1.pick)(row, "statuscode")) : null)
    };
}
async function getActiveTasks() {
    try {
        const select = process.env.DATAVERSE_TASKS_SELECT?.trim() || SELECT_FIELDS;
        const rows = await (0, dataverseRead_1.dataverseReadAll)(DEFAULT_ENTITY_SET, select);
        return rows.filter((r) => !isCompletedTask(r)).map(toTask);
    }
    catch {
        return [];
    }
}
