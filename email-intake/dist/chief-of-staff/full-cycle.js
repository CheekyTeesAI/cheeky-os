"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runChiefFullCycle = runChiefFullCycle;
const memory_engine_1 = require("./memory-engine");
const briefing_engine_1 = require("./briefing-engine");
const intel_engine_1 = require("./intel-engine");
const kaizen_engine_1 = require("./kaizen-engine");
const task_engine_1 = require("./task-engine");
async function runChiefFullCycle(inputText = "") {
    const dailyFile = await (0, memory_engine_1.ensureDailyMemory)();
    if (inputText.trim()) {
        await (0, memory_engine_1.appendDailyEvent)({
            type: "note",
            title: "Ingested input",
            detail: inputText.trim().slice(0, 500)
        });
        const tasks = (0, task_engine_1.extractTasksFromText)(inputText, "chief-full-cycle");
        await (0, task_engine_1.upsertMasterTasks)(tasks);
        await (0, task_engine_1.generateTaskViews)();
    }
    await (0, memory_engine_1.upsertEntityMemory)({
        type: "relationships",
        name: "cheeky-os-operator-layer",
        summary: "Chief of Staff operating memory for commitments, risks, and execution control.",
        currentStatus: "Active",
        nextAction: "Ingest real customer/order signals and reduce mock dependence.",
        risks: ["Insufficient source data can cause weak prioritization."]
    });
    await (0, memory_engine_1.updateMemorySpine)();
    await (0, intel_engine_1.generateIntelFiles)();
    const morningBrief = await (0, briefing_engine_1.generateMorningBrief)();
    const eveningBrief = await (0, briefing_engine_1.generateEveningWrap)();
    const kaizenFile = await (0, kaizen_engine_1.generateWeeklyKaizen)();
    return { dailyFile, morningBrief, eveningBrief, kaizenFile };
}
