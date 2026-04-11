"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runFollowUpJob = runFollowUpJob;
const followUpEngine_1 = require("../services/followUpEngine");
async function runFollowUpJob() {
    try {
        await (0, followUpEngine_1.runFollowUps)();
    }
    catch (err) {
        console.error("[followUpJob]", err instanceof Error ? err.message : err);
    }
}
