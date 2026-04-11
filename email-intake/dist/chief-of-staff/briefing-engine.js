"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateMorningBrief = generateMorningBrief;
exports.generateEveningWrap = generateEveningWrap;
const fs_utils_1 = require("./fs-utils");
async function generateMorningBrief(date = new Date()) {
    const iso = (0, fs_utils_1.todayIso)(date);
    const overdue = await (0, fs_utils_1.readFileSafe)((0, fs_utils_1.p)("tasks", "overdue.md"));
    const week = await (0, fs_utils_1.readFileSafe)((0, fs_utils_1.p)("tasks", "this_week.md"));
    const blocked = await (0, fs_utils_1.readFileSafe)((0, fs_utils_1.p)("intel", "blocked-items.md"));
    const sales = await (0, fs_utils_1.readFileSafe)((0, fs_utils_1.p)("intel", "sales-opportunities.md"));
    const content = `# Morning Brief - ${iso}

## Top Priorities
${extractBullets(week, 5)}

## Overdue Follow-Ups
${extractBullets(overdue, 5)}

## Active Order Risks
${extractBullets(blocked, 5)}

## Trapped Cash Opportunities
${extractBullets(sales, 5)}

## Must-Do Before Noon
${extractBullets(overdue + "\n" + week, 5)}

## Last Updated
- ${new Date().toISOString()}
`;
    const out = (0, fs_utils_1.p)("briefs", "morning", `${iso}.md`);
    await (0, fs_utils_1.writeFileAtomic)(out, content);
    return out;
}
async function generateEveningWrap(date = new Date()) {
    const iso = (0, fs_utils_1.todayIso)(date);
    const daily = await (0, fs_utils_1.readFileSafe)((0, fs_utils_1.p)("memory", "daily", `${iso}.md`));
    const overdue = await (0, fs_utils_1.readFileSafe)((0, fs_utils_1.p)("tasks", "overdue.md"));
    const content = `# Evening Wrap - ${iso}

## What Moved
${extractBullets(daily, 5)}

## What Stalled
${extractBullets(overdue, 5)}

## Promises Made Today
${extractBullets(daily, 5)}

## Needs Tomorrow Follow-Up
${extractBullets(overdue, 5)}

## Key Unresolved Risks
${extractBullets(await (0, fs_utils_1.readFileSafe)((0, fs_utils_1.p)("intel", "risk-register.md")), 5)}

## Last Updated
- ${new Date().toISOString()}
`;
    const out = (0, fs_utils_1.p)("briefs", "evening", `${iso}.md`);
    await (0, fs_utils_1.writeFileAtomic)(out, content);
    return out;
}
function extractBullets(markdown, limit) {
    const items = markdown
        .split(/\r?\n/)
        .map((x) => x.trim())
        .filter((x) => x.startsWith("- "))
        .slice(0, limit);
    return items.length ? items.join("\n") : "- (none)";
}
