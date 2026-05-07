"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runFollowUpJob = runFollowUpJob;
const followupEngine_1 = require("../services/followupEngine");
async function runFollowUpJob() {
    try {
        await (0, followupEngine_1.runFollowUps)();
    }
    catch (err) {
        console.error("[followUpJob]", err instanceof Error ? err.message : err);
    }
}
