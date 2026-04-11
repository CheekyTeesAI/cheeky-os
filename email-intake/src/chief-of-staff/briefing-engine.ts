import { p, readFileSafe, todayIso, writeFileAtomic } from "./fs-utils";

export async function generateMorningBrief(date: Date = new Date()): Promise<string> {
  const iso = todayIso(date);
  const overdue = await readFileSafe(p("tasks", "overdue.md"));
  const week = await readFileSafe(p("tasks", "this_week.md"));
  const blocked = await readFileSafe(p("intel", "blocked-items.md"));
  const sales = await readFileSafe(p("intel", "sales-opportunities.md"));
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
  const out = p("briefs", "morning", `${iso}.md`);
  await writeFileAtomic(out, content);
  return out;
}

export async function generateEveningWrap(date: Date = new Date()): Promise<string> {
  const iso = todayIso(date);
  const daily = await readFileSafe(p("memory", "daily", `${iso}.md`));
  const overdue = await readFileSafe(p("tasks", "overdue.md"));
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
${extractBullets(await readFileSafe(p("intel", "risk-register.md")), 5)}

## Last Updated
- ${new Date().toISOString()}
`;
  const out = p("briefs", "evening", `${iso}.md`);
  await writeFileAtomic(out, content);
  return out;
}

function extractBullets(markdown: string, limit: number): string {
  const items = markdown
    .split(/\r?\n/)
    .map((x) => x.trim())
    .filter((x) => x.startsWith("- "))
    .slice(0, limit);
  return items.length ? items.join("\n") : "- (none)";
}
