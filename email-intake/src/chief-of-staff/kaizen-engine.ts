import { promises as fs } from "fs";
import path from "path";
import { p, todayIso, writeFileAtomic } from "./fs-utils";

export async function generateWeeklyKaizen(referenceDate: Date = new Date()): Promise<string> {
  const iso = todayIso(referenceDate);
  const dailyDir = p("memory", "daily");
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
${recent.length ? recent.map((f) => `- ${path.basename(f)}`).join("\n") : "- No daily files found."}

## Last Updated
- ${new Date().toISOString()}
`;
  const out = p("memory", "kaizen", `kaizen-${iso}.md`);
  await writeFileAtomic(out, review);
  return out;
}

async function listMarkdown(dir: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(dir);
    return entries.filter((x) => x.endsWith(".md")).map((x) => path.join(dir, x)).sort();
  } catch {
    return [];
  }
}
