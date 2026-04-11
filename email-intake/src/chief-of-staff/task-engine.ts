import { p, readFileSafe, todayIso, writeFileAtomic } from "./fs-utils";

export interface TaskItem {
  id: string;
  title: string;
  owner: string;
  dueDate?: string;
  status: "open" | "done" | "blocked";
  source: string;
  lastUpdated: string;
  rollForwards: number;
}

export function extractTasksFromText(text: string, source = "input"): TaskItem[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const out: TaskItem[] = [];
  for (const line of lines) {
    if (!/(will|promise|follow up|send|call|review|by\s+\d{4}-\d{2}-\d{2})/i.test(line)) continue;
    const due = line.match(/\b(20\d{2}-\d{2}-\d{2})\b/)?.[1];
    out.push({
      id: `task_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      title: line,
      owner: "cheeky-ops",
      dueDate: due,
      status: "open",
      source,
      lastUpdated: new Date().toISOString(),
      rollForwards: 0
    });
  }
  return out;
}

export async function upsertMasterTasks(newTasks: TaskItem[]): Promise<TaskItem[]> {
  const filePath = p("tasks", "master_tasks.md");
  const existing = await readFileSafe(filePath);
  const current = parseTasks(existing);
  const merged = [...current, ...newTasks];
  await writeFileAtomic(filePath, renderTasks("Master Tasks", merged));
  return merged;
}

export async function generateTaskViews(referenceDate = new Date()): Promise<void> {
  const filePath = p("tasks", "master_tasks.md");
  const all = parseTasks(await readFileSafe(filePath));
  const today = new Date(todayIso(referenceDate));
  const weekEnd = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);

  const overdue = all.filter((t) => t.status !== "done" && t.dueDate && new Date(t.dueDate) < today);
  const thisWeek = all.filter((t) => {
    if (t.status === "done" || !t.dueDate) return false;
    const due = new Date(t.dueDate);
    return due >= today && due <= weekEnd;
  });

  const stale = all.filter((t) => {
    const updated = new Date(t.lastUpdated).getTime();
    return t.status !== "done" && Number.isFinite(updated) && Date.now() - updated > 7 * 24 * 60 * 60 * 1000;
  });
  for (const t of stale) t.rollForwards += 1;

  await writeFileAtomic(p("tasks", "overdue.md"), renderTasks("Overdue Tasks", overdue));
  await writeFileAtomic(p("tasks", "this_week.md"), renderTasks("This Week Tasks", thisWeek));
  await writeFileAtomic(filePath, renderTasks("Master Tasks", all));
}

function renderTasks(title: string, tasks: TaskItem[]): string {
  const rows = tasks.length
    ? tasks
        .map(
          (t) =>
            `- [${t.status}] ${t.title} | owner=${t.owner} | due=${t.dueDate ?? "n/a"} | source=${t.source} | roll=${t.rollForwards}`
        )
        .join("\n")
    : "- (none yet)";
  return `# ${title}

## Summary
Auto-generated task view for follow-through control.

## Tasks
${rows}

## Last Updated
- ${new Date().toISOString()}
`;
}

function parseTasks(markdown: string): TaskItem[] {
  const lines = markdown.split(/\r?\n/);
  const out: TaskItem[] = [];
  for (const line of lines) {
    if (!line.startsWith("- [")) continue;
    const status = line.includes("[done]") ? "done" : line.includes("[blocked]") ? "blocked" : "open";
    out.push({
      id: `parsed_${Math.random().toString(36).slice(2, 7)}`,
      title: line.replace(/^- \[[^\]]+\]\s*/, "").split("|")[0].trim(),
      owner: pickMeta(line, "owner") ?? "cheeky-ops",
      dueDate: pickMeta(line, "due") ?? undefined,
      status,
      source: pickMeta(line, "source") ?? "unknown",
      lastUpdated: new Date().toISOString(),
      rollForwards: Number(pickMeta(line, "roll") ?? "0") || 0
    });
  }
  return out;
}

function pickMeta(line: string, key: string): string | null {
  const m = line.match(new RegExp(`${key}=([^|]+)`));
  return m?.[1]?.trim() ?? null;
}
