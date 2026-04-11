"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTopSalesPriorities = getTopSalesPriorities;
exports.getTopProductionPriorities = getTopProductionPriorities;
const types_1 = require("../../command-layer/models/types");
function stageUrgency(stage) {
    if (stage === types_1.LeadStage.CLOSE_ATTEMPT)
        return 5;
    if (stage === types_1.LeadStage.FOLLOW_UP)
        return 4;
    if (stage === types_1.LeadStage.QUOTED)
        return 3;
    if (stage === types_1.LeadStage.DEPOSIT_PAID)
        return 6;
    if (stage === types_1.LeadStage.CONTACTED)
        return 2;
    if (stage === types_1.LeadStage.NEW)
        return 1;
    return 0;
}
function getTopSalesPriorities(salesState) {
    const rows = salesState.pipeline.nextBestActions.map((a) => ({
        name: a.name,
        value: a.value,
        stage: a.stage,
        recommendedAction: a.recommendedAction
    }));
    rows.sort((a, b) => {
        if (b.value !== a.value)
            return b.value - a.value;
        return stageUrgency(b.stage) - stageUrgency(a.stage);
    });
    return rows.slice(0, 5).map(({ name, value, stage, recommendedAction }) => ({
        name,
        value,
        stage,
        recommendedAction
    }));
}
function getTopProductionPriorities(productionState) {
    const jobs = [...productionState.jobs];
    jobs.sort((a, b) => {
        if (a.rush !== b.rush)
            return a.rush ? -1 : 1;
        const da = a.dueDate ? new Date(a.dueDate).getTime() : Number.POSITIVE_INFINITY;
        const db = b.dueDate ? new Date(b.dueDate).getTime() : Number.POSITIVE_INFINITY;
        if (da !== db)
            return da - db;
        if (b.qty !== a.qty)
            return b.qty - a.qty;
        if (a.type === "DTG" && b.type !== "DTG")
            return -1;
        if (b.type === "DTG" && a.type !== "DTG")
            return 1;
        return 0;
    });
    return jobs.slice(0, 5).map((j) => ({
        id: j.id,
        name: j.name,
        qty: j.qty,
        type: j.type,
        dueDate: j.dueDate,
        rush: j.rush
    }));
}
