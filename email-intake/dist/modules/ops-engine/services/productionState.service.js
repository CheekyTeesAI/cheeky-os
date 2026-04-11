"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getProductionState = getProductionState;
const getActiveOrders_1 = require("../../production/getActiveOrders");
function normalizeType(t) {
    if (t === "DTG" || t === "DTF" || t === "ScreenPrint")
        return t;
    return "Unknown";
}
function detectBottlenecks(jobs) {
    const b = [];
    const rush = jobs.filter((j) => j.rush).length;
    const dtg = jobs.filter((j) => j.type === "DTG").length;
    const missingDue = jobs.filter((j) => !j.dueDate || j.dueDate.trim() === "").length;
    const active = jobs.length;
    if (rush > 3) {
        b.push("Rush production overloaded — sequenced queue required");
    }
    if (dtg > 4) {
        b.push("DTG queue overloaded — batch light/dark and cap starts");
    }
    if (missingDue >= 2) {
        b.push(`${missingDue} jobs missing due dates — set dates before 10am`);
    }
    if (active > 8) {
        b.push("Overloaded day — delay lowest priority job to tomorrow");
    }
    return b;
}
async function getProductionState() {
    let raw = [];
    try {
        raw = await (0, getActiveOrders_1.getActiveOrders)();
    }
    catch {
        raw = [];
    }
    const jobs = raw.map((j, i) => ({
        id: j.id || `dv-${i}-${String(j.name).replace(/\s+/g, "-").slice(0, 24)}`,
        name: j.name,
        qty: j.qty,
        type: normalizeType(j.type),
        dueDate: j.dueDate ? j.dueDate : null,
        rush: j.rush,
        status: j.status || null
    }));
    const dtgCount = jobs.filter((j) => j.type === "DTG").length;
    const dtfCount = jobs.filter((j) => j.type === "DTF").length;
    const screenPrintCount = jobs.filter((j) => j.type === "ScreenPrint").length;
    return {
        jobs,
        summary: {
            activeJobCount: jobs.length,
            rushJobCount: jobs.filter((j) => j.rush).length,
            dtgCount,
            dtfCount,
            screenPrintCount
        },
        bottlenecks: detectBottlenecks(jobs)
    };
}
