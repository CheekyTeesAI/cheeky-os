const fs = require("fs");
const path = require("path");

function todayIso(dateObj = new Date()) {
  return dateObj.toISOString().slice(0, 10);
}

function readSafe(filePath) {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return "";
  }
}

function parseTasks(md) {
  const lines = md.split(/\r?\n/);
  const tasks = [];
  let current = null;
  for (const line of lines) {
    if (line.startsWith("### TASK-")) {
      if (current) tasks.push(current);
      current = { id: line.replace("### ", "").trim(), status: "open", description: "" };
      continue;
    }
    if (!current) continue;
    let m = line.match(/^- Status:\s*(.*)$/);
    if (m) current.status = m[1].trim();
    m = line.match(/^- Description:\s*(.*)$/);
    if (m) current.description = m[1].trim();
  }
  if (current) tasks.push(current);
  return tasks;
}

function sectionText(md, sectionTitle) {
  const marker = `## ${sectionTitle}`;
  const idx = md.indexOf(marker);
  if (idx < 0) return "";
  const lines = md.slice(idx + marker.length).split(/\r?\n/);
  const out = [];
  for (const line of lines) {
    if (line.startsWith("## ")) break;
    if (line.trim().startsWith("- ")) out.push(line.trim().replace(/^- /, ""));
  }
  return out.join("\n");
}

function generateEveningWrap() {
  const root = path.join(__dirname, "../../");
  const tasksMd = readSafe(path.join(root, "tasks/master_tasks.md"));
  const blockedMd = readSafe(path.join(root, "intel/blocked-items.md"));
  const dailyMd = readSafe(path.join(root, `memory/daily/${todayIso()}.md`));
  const outPath = path.join(root, `briefs/evening/${todayIso()}.md`);

  const tasks = parseTasks(tasksMd);
  const moved = tasks.filter((t) => String(t.status).toLowerCase() !== "open").slice(0, 3);
  const stalled = tasks.filter((t) => String(t.status).toLowerCase() === "open").slice(0, 3);
  const risks = sectionText(blockedMd, "🚧 Blocked Items")
    .split(/\r?\n/)
    .filter(Boolean)
    .slice(0, 3);
  const tomorrow = stalled.map((t) => `${t.id}: ${t.description}`).slice(0, 3);
  const events = sectionText(dailyMd, "Events Log")
    .split(/\r?\n/)
    .filter(Boolean)
    .slice(0, 2);

  const content = `---
type: evening-wrap
generated: ${new Date().toISOString()}
---

## ✅ WHAT MOVED

${moved.map((t) => `- ${t.id}: ${t.description}`).join("\n") || "- No completed task updates captured"}

---

## 🧱 WHAT STALLED

${stalled.map((t) => `- ${t.id}: ${t.description}`).join("\n") || "- No stalled items detected"}

---

## ⚠️ RISKS STILL OPEN

${risks.map((r) => `- ${r}`).join("\n") || "- No active blockers"}

---

## 📅 TOMORROW STARTS WITH

${tomorrow.map((x) => `- ${x}`).join("\n") || events.map((x) => `- ${x}`).join("\n") || "- Review operator report first"}

---
`;

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, content, "utf8");
  return { path: outPath };
}

module.exports = generateEveningWrap;
