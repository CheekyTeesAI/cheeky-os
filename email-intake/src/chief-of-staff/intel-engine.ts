import { p, readFileSafe, writeFileAtomic } from "./fs-utils";

export async function generateIntelFiles(): Promise<void> {
  const overdue = await readFileSafe(p("tasks", "overdue.md"));
  const week = await readFileSafe(p("tasks", "this_week.md"));
  const memory = await readFileSafe(p("memory", "MEMORY.md"));

  await writeFileAtomic(
    p("intel", "risk-register.md"),
    `# Risk Register

## Summary
Auto-generated risk list from tasks and memory signals.

## Risks
${deriveRisks(overdue, memory)}

## Last Updated
- ${new Date().toISOString()}
`
  );

  await writeFileAtomic(
    p("intel", "blocked-items.md"),
    `# Blocked Items

## Summary
Items currently blocked by overdue dependencies.

## Blockers
${deriveBlocked(overdue)}

## Last Updated
- ${new Date().toISOString()}
`
  );

  await writeFileAtomic(
    p("intel", "sales-opportunities.md"),
    `# Sales Opportunities

## Summary
Revenue opportunities inferred from task backlog and stale commitments.

## Opportunities
${deriveOpportunities(week, overdue)}

## Last Updated
- ${new Date().toISOString()}
`
  );
}

function deriveRisks(overdue: string, memory: string): string {
  const rows: string[] = [];
  if (overdue.includes("- [open]")) rows.push("- Overdue open commitments threaten deadline reliability.");
  if (memory.toLowerCase().includes("stale")) rows.push("- Memory indicates stale operational updates.");
  rows.push("- Unpaid deposits should be confirmed before blank purchasing.");
  return rows.join("\n");
}

function deriveBlocked(overdue: string): string {
  const tasks = overdue
    .split(/\r?\n/)
    .filter((x) => x.startsWith("- [open]") || x.startsWith("- [blocked]"))
    .slice(0, 10);
  return tasks.length ? tasks.join("\n") : ["- No active blockers detected."].join("\n");
}

function deriveOpportunities(week: string, overdue: string): string {
  const rows = [
    "- Reactivate repeat customers inactive 60+ days with targeted offers.",
    "- Prioritize stale estimates with high total amounts for same-day follow-up.",
    "- Convert high-likelihood quote requests into draft invoices quickly."
  ];
  if (week.includes("due=")) rows.push("- This-week due commitments can unlock trapped cash if executed by noon windows.");
  if (overdue.includes("- [open]")) rows.push("- Overdue tasks likely hide delayed cash collection opportunities.");
  return rows.join("\n");
}
