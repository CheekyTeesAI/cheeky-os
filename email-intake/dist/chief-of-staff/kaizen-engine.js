"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateWeeklyKaizen = generateWeeklyKaizen;
const fs_1 = require("fs");
const path_1 = __importDefault(require("path"));
const fs_utils_1 = require("./fs-utils");
async function generateWeeklyKaizen(referenceDate = new Date()) {
    const iso = (0, fs_utils_1.todayIso)(referenceDate);
    const dailyDir = (0, fs_utils_1.p)("memory", "daily");
    const files = await listMarkdown(dailyDir);
    const recent = files.slice(-7);
    const review = `# Weekly Kaizen - ${iso}

## Summary
Weekly improvement review generated from memory, tasks, and intel artifacts.

## Friction Patterns
- Repeated overdue items indicate follow-through gaps.
- Mock-first engines limit signal quality for automated prioritization.

## Low-Value / Noisy Outputs
- Duplicate status lines without owner or due date should be reduced.

## Missed Follow-Ups
- Review overdue tasks for roll-forward count > 1 and escalate ownership.

## Rules/Prompts To Improve
- Enforce due date capture for every promise.
- Require customer or order reference in every follow-up task.
- Auto-tag cash-risk tasks for morning brief inclusion.

## Source Snapshot
${recent.length ? recent.map((f) => `- ${path_1.default.basename(f)}`).join("\n") : "- No daily files found."}

## Last Updated
- ${new Date().toISOString()}
`;
    const out = (0, fs_utils_1.p)("memory", "kaizen", `kaizen-${iso}.md`);
    await (0, fs_utils_1.writeFileAtomic)(out, review);
    return out;
}
async function listMarkdown(dir) {
    try {
        const entries = await fs_1.promises.readdir(dir);
        return entries.filter((x) => x.endsWith(".md")).map((x) => path_1.default.join(dir, x)).sort();
    }
    catch {
        return [];
    }
}
