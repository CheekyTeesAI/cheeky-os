"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ensureDailyMemory = ensureDailyMemory;
exports.appendDailyEvent = appendDailyEvent;
exports.upsertEntityMemory = upsertEntityMemory;
exports.updateMemorySpine = updateMemorySpine;
const path_1 = __importDefault(require("path"));
const fs_utils_1 = require("./fs-utils");
function dailyTemplate(isoDate) {
    return `# Daily Memory - ${isoDate}

## Summary
- Day initialized.

## Events
- (none yet)

## Commitments Captured
- (none yet)

## Risks
- (none yet)

## Last Updated
- ${isoDate}
`;
}
function entityTemplate(input, now) {
    const commitments = (input.openCommitments ?? []).map((x) => `- ${x}`).join("\n") || "- (none)";
    const risks = (input.risks ?? []).map((x) => `- ${x}`).join("\n") || "- (none)";
    const notes = (input.notes ?? []).map((x) => `- ${x}`).join("\n") || "- (none)";
    return `# ${input.name}

## Summary
${input.summary ?? "No summary yet."}

## Current Status
${input.currentStatus ?? "Unknown"}

## Last Touch
${input.lastTouch ?? now}

## Open Commitments
${commitments}

## Next Action
${input.nextAction ?? "TBD"}

## Risks
${risks}

## Notes
${notes}

## Last Updated
${now}
`;
}
async function ensureDailyMemory(date = new Date()) {
    const iso = (0, fs_utils_1.todayIso)(date);
    const filePath = (0, fs_utils_1.p)("memory", "daily", `${iso}.md`);
    await (0, fs_utils_1.ensureDir)(path_1.default.dirname(filePath));
    const existing = await (0, fs_utils_1.readFileSafe)(filePath);
    if (!existing.trim()) {
        await (0, fs_utils_1.writeFileAtomic)(filePath, dailyTemplate(iso));
    }
    return filePath;
}
async function appendDailyEvent(event, date = new Date()) {
    const filePath = await ensureDailyMemory(date);
    const existing = await (0, fs_utils_1.readFileSafe)(filePath);
    const stamp = new Date().toISOString();
    const line = `- [${event.type}] ${event.title} - ${event.detail} (${stamp})`;
    const next = existing.replace("## Events\n- (none yet)", `## Events\n${line}`).includes("## Events\n- (none yet)")
        ? existing.replace("## Events\n- (none yet)", `## Events\n${line}`)
        : existing.replace("## Events\n", `## Events\n${line}\n`);
    await (0, fs_utils_1.writeFileAtomic)(filePath, next);
}
async function upsertEntityMemory(input) {
    const now = new Date().toISOString();
    const slug = (0, fs_utils_1.slugify)(input.name);
    const filePath = (0, fs_utils_1.p)("memory", input.type, `${slug}.md`);
    const existing = await (0, fs_utils_1.readFileSafe)(filePath);
    if (!existing.trim()) {
        await (0, fs_utils_1.writeFileAtomic)(filePath, entityTemplate(input, now));
        return filePath;
    }
    const merged = entityTemplate({
        ...input,
        summary: input.summary ?? extractSection(existing, "Summary"),
        currentStatus: input.currentStatus ?? extractSection(existing, "Current Status"),
        lastTouch: input.lastTouch ?? now,
        nextAction: input.nextAction ?? extractSection(existing, "Next Action")
    }, now);
    await (0, fs_utils_1.writeFileAtomic)(filePath, merged);
    return filePath;
}
function extractSection(markdown, section) {
    const marker = `## ${section}`;
    const i = markdown.indexOf(marker);
    if (i < 0)
        return "";
    const after = markdown.slice(i + marker.length).trimStart();
    const end = after.indexOf("\n## ");
    return (end >= 0 ? after.slice(0, end) : after).trim() || "";
}
async function updateMemorySpine() {
    const now = new Date().toISOString();
    const customerDir = (0, fs_utils_1.p)("memory", "customers");
    const orderDir = (0, fs_utils_1.p)("memory", "orders");
    const customerCount = (await readDirCount(customerDir));
    const orderCount = (await readDirCount(orderDir));
    const content = `# Cheeky OS Memory Spine

## Summary
Persistent distilled operational state managed by Chief of Staff engines.

## Current Status
- Customer entities tracked: ${customerCount}
- Order entities tracked: ${orderCount}
- Daily journal active: yes

## Open Commitments
- See ../tasks/master_tasks.md

## Next Action
- Run task + brief generators after new events are appended.

## Risks
- Missing source ingest can produce stale operational memory.

## Notes
- This file is rebuilt by memory engine updates.

## Last Updated
- ${now}
`;
    await (0, fs_utils_1.writeFileAtomic)((0, fs_utils_1.p)("memory", "MEMORY.md"), content);
}
async function readDirCount(dirPath) {
    try {
        const { promises: fs } = await Promise.resolve().then(() => __importStar(require("fs")));
        const entries = await fs.readdir(dirPath, { withFileTypes: true });
        return entries.filter((e) => e.isFile() && e.name.endsWith(".md") && e.name !== "README.md").length;
    }
    catch {
        return 0;
    }
}
