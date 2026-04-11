import path from "path";
import { ensureDir, p, readFileSafe, slugify, todayIso, writeFileAtomic } from "./fs-utils";

export type MemoryEntityType = "customers" | "vendors" | "orders" | "relationships";

export interface MemoryEntityInput {
  type: MemoryEntityType;
  name: string;
  summary?: string;
  currentStatus?: string;
  openCommitments?: string[];
  nextAction?: string;
  risks?: string[];
  notes?: string[];
  lastTouch?: string;
}

export interface DailyEventInput {
  type: "commitment" | "risk" | "order" | "customer" | "note";
  title: string;
  detail: string;
}

function dailyTemplate(isoDate: string): string {
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

function entityTemplate(input: MemoryEntityInput, now: string): string {
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

export async function ensureDailyMemory(date: Date = new Date()): Promise<string> {
  const iso = todayIso(date);
  const filePath = p("memory", "daily", `${iso}.md`);
  await ensureDir(path.dirname(filePath));
  const existing = await readFileSafe(filePath);
  if (!existing.trim()) {
    await writeFileAtomic(filePath, dailyTemplate(iso));
  }
  return filePath;
}

export async function appendDailyEvent(event: DailyEventInput, date: Date = new Date()): Promise<void> {
  const filePath = await ensureDailyMemory(date);
  const existing = await readFileSafe(filePath);
  const stamp = new Date().toISOString();
  const line = `- [${event.type}] ${event.title} - ${event.detail} (${stamp})`;
  const next = existing.replace("## Events\n- (none yet)", `## Events\n${line}`).includes("## Events\n- (none yet)")
    ? existing.replace("## Events\n- (none yet)", `## Events\n${line}`)
    : existing.replace("## Events\n", `## Events\n${line}\n`);
  await writeFileAtomic(filePath, next);
}

export async function upsertEntityMemory(input: MemoryEntityInput): Promise<string> {
  const now = new Date().toISOString();
  const slug = slugify(input.name);
  const filePath = p("memory", input.type, `${slug}.md`);
  const existing = await readFileSafe(filePath);
  if (!existing.trim()) {
    await writeFileAtomic(filePath, entityTemplate(input, now));
    return filePath;
  }

  const merged = entityTemplate(
    {
      ...input,
      summary: input.summary ?? extractSection(existing, "Summary"),
      currentStatus: input.currentStatus ?? extractSection(existing, "Current Status"),
      lastTouch: input.lastTouch ?? now,
      nextAction: input.nextAction ?? extractSection(existing, "Next Action")
    },
    now
  );
  await writeFileAtomic(filePath, merged);
  return filePath;
}

function extractSection(markdown: string, section: string): string {
  const marker = `## ${section}`;
  const i = markdown.indexOf(marker);
  if (i < 0) return "";
  const after = markdown.slice(i + marker.length).trimStart();
  const end = after.indexOf("\n## ");
  return (end >= 0 ? after.slice(0, end) : after).trim() || "";
}

export async function updateMemorySpine(): Promise<void> {
  const now = new Date().toISOString();
  const customerDir = p("memory", "customers");
  const orderDir = p("memory", "orders");
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
  await writeFileAtomic(p("memory", "MEMORY.md"), content);
}

async function readDirCount(dirPath: string): Promise<number> {
  try {
    const { promises: fs } = await import("fs");
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    return entries.filter((e) => e.isFile() && e.name.endsWith(".md") && e.name !== "README.md").length;
  } catch {
    return 0;
  }
}
