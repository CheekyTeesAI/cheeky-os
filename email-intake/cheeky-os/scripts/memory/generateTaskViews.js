const fs = require("fs");
const path = require("path");

function todayIso(dateObj = new Date()) {
  return dateObj.toISOString().slice(0, 10);
}

function parseDate(value) {
  if (!value || value === "null") return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function priorityRank(priority) {
  if (priority === "high") return 3;
  if (priority === "medium") return 2;
  return 1;
}

function parseTasks(markdown) {
  const lines = markdown.split(/\r?\n/);
  const tasks = [];
  let current = null;

  for (const line of lines) {
    if (line.startsWith("### TASK-")) {
      if (current) tasks.push(current);
      current = { id: line.replace("### ", "").trim() };
      continue;
    }
    if (!current) continue;
    const m = line.match(/^- ([^:]+):\s*(.*)$/);
    if (!m) continue;
    const key = m[1].trim();
    const value = m[2].trim();
    if (key === "Description") current.description = value;
    if (key === "Source") current.source = value;
    if (key === "Due") current.due = value;
    if (key === "Priority") current.priority = value;
    if (key === "Status") current.status = value;
    if (key === "Rollover Count") current.rollover = Number(value) || 0;
    if (key === "Escalation Level") current.escalation = Number(value) || 0;
    if (key === "Last Updated") current.lastUpdated = value;
  }
  if (current) tasks.push(current);
  return tasks;
}

function renderTaskBlock(task) {
  return `### ${task.id}

- Description: ${task.description || ""}
- Source: ${task.source || ""}
- Due: ${task.due || "null"}
- Priority: ${task.priority || "low"}
- Status: ${task.status || "open"}
- Rollover Count: ${task.rollover || 0}
- Escalation Level: ${task.escalation || 0}
- Last Updated: ${task.lastUpdated || todayIso()}`;
}

function rewriteMaster(markdown, tasks) {
  const topSplit = markdown.split("## Tasks");
  const headerPart = topSplit[0] + "## Tasks\n";
  const body = tasks.length ? `\n${tasks.map(renderTaskBlock).join("\n\n")}\n\n---\n` : "\n\n---\n";
  const updated = new Date().toISOString();
  let out = headerPart + body;
  out = out.replace(/^updated:\s*.*$/m, `updated: ${updated}`);
  const openCount = tasks.filter((t) => (t.status || "open") === "open").length;
  out = out.replace(/^open_count:\s*.*$/m, `open_count: ${openCount}`);
  return out;
}

function formatOverdueItem(t) {
  const stale = (t.rollover || 0) >= 2 ? " — ⚠️ STALE" : "";
  const due = t.due && t.due !== "null" ? `due ${t.due}` : "no due";
  return `- ${t.id} — ${t.description} — ${t.priority || "low"} — ${due}${stale}`;
}

function formatWeekItem(t) {
  return `- ${t.id} — ${t.description} — ${t.priority || "low"} — due ${t.due}`;
}

function generateTaskViews() {
  const root = path.join(__dirname, "../../");
  const masterPath = path.join(root, "tasks/master_tasks.md");
  const overduePath = path.join(root, "tasks/overdue.md");
  const weekPath = path.join(root, "tasks/this_week.md");
  const master = fs.readFileSync(masterPath, "utf8");
  const tasks = parseTasks(master);
  const now = new Date();
  const today = new Date(todayIso(now));
  const weekEnd = new Date(today.getTime());
  weekEnd.setUTCDate(weekEnd.getUTCDate() + 7);

  const overdue = [];
  const thisWeek = [];

  for (const t of tasks) {
    if ((t.status || "open") !== "open") continue;
    const due = parseDate(t.due);
    const lastUpdated = parseDate(t.lastUpdated);
    const staleNoDue =
      !due &&
      lastUpdated &&
      (today.getTime() - new Date(todayIso(lastUpdated)).getTime()) / (1000 * 60 * 60 * 24) > 5;
    const isOverdue = (due && due < today) || staleNoDue;

    if (isOverdue) {
      t.rollover = (t.rollover || 0) + 1;
      if ((t.rollover || 0) >= 3) t.escalation = 2;
      t.lastUpdated = todayIso(now);
      overdue.push(t);
      continue;
    }

    if (due && due >= today && due <= weekEnd) {
      thisWeek.push(t);
    }
  }

  thisWeek.sort((a, b) => {
    const esc = (b.escalation || 0) - (a.escalation || 0);
    if (esc !== 0) return esc;
    const pr = priorityRank(b.priority || "low") - priorityRank(a.priority || "low");
    if (pr !== 0) return pr;
    return String(a.due || "").localeCompare(String(b.due || ""));
  });

  const overdueContent = `---
type: task-view
updated: ${new Date().toISOString()}
view: overdue
item_count: ${overdue.length}
---

## 🔴 OVERDUE TASKS

${overdue.slice(0, 5).map(formatOverdueItem).join("\n") || "- (none)"}

## Last Updated
${new Date().toISOString()}
`;

  const weekContent = `---
type: task-view
updated: ${new Date().toISOString()}
view: this-week
item_count: ${thisWeek.length}
---

## 📅 THIS WEEK

${thisWeek.slice(0, 5).map(formatWeekItem).join("\n") || "- (none)"}

## Last Updated
${new Date().toISOString()}
`;

  fs.writeFileSync(masterPath, rewriteMaster(master, tasks), "utf8");
  fs.writeFileSync(overduePath, overdueContent, "utf8");
  fs.writeFileSync(weekPath, weekContent, "utf8");

  return {
    overdue: overdue.length,
    thisWeek: thisWeek.length
  };
}

module.exports = generateTaskViews;
