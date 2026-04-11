const fs = require("fs");
const path = require("path");

function todayIso(dateObj = new Date()) {
  return dateObj.toISOString().slice(0, 10);
}

function readFileSafe(filePath) {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return "";
  }
}

function listMarkdown(dirPath) {
  try {
    return fs
      .readdirSync(dirPath)
      .filter((x) => x.endsWith(".md") && x !== ".gitkeep")
      .map((x) => path.join(dirPath, x));
  } catch {
    return [];
  }
}

function parseTasks(markdown) {
  const lines = markdown.split(/\r?\n/);
  const out = [];
  let current = null;
  for (const line of lines) {
    if (line.startsWith("### TASK-")) {
      if (current) out.push(current);
      current = { id: line.replace("### ", "").trim() };
      continue;
    }
    if (!current) continue;
    const m = line.match(/^- ([^:]+):\s*(.*)$/);
    if (!m) continue;
    const k = m[1].trim();
    const v = m[2].trim();
    if (k === "Description") current.description = v;
    if (k === "Priority") current.priority = v;
    if (k === "Status") current.status = v;
  }
  if (current) out.push(current);
  return out;
}

function firstLineAfterSection(md, section) {
  const h = `## ${section}`;
  const i = md.indexOf(h);
  if (i < 0) return "";
  const after = md.slice(i + h.length).split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
  return after[0] || "";
}

function staleOver30Days(md) {
  const m = md.match(/^updated:\s*(\d{4}-\d{2}-\d{2})/m) || md.match(/^updated:\s*([0-9T:\-\.Z]+)/m);
  if (!m) return false;
  const d = new Date(m[1]);
  if (Number.isNaN(d.getTime())) return false;
  return Date.now() - d.getTime() > 30 * 24 * 60 * 60 * 1000;
}

function generateRevenueIntel() {
  const root = path.join(__dirname, "../../");
  const tasksPath = path.join(root, "tasks/master_tasks.md");
  const salesPath = path.join(root, "intel/sales-opportunities.md");
  const blockedPath = path.join(root, "intel/blocked-items.md");
  const callListPath = path.join(root, `outputs/call-lists/${todayIso()}.md`);

  const tasks = parseTasks(readFileSafe(tasksPath)).filter((t) => (t.status || "open") === "open");
  const customerFiles = listMarkdown(path.join(root, "memory/customers"));
  const orderFiles = listMarkdown(path.join(root, "memory/orders"));

  const highCash = [];
  const followups = [];
  const reactivation = [];
  const low = [];
  const blocked = [];

  for (const t of tasks) {
    const d = (t.description || "").toLowerCase();
    if (/(follow up|quote|invoice|deposit|payment)/i.test(d)) {
      highCash.push(`- ${t.id}: ${t.description}`);
    } else if (/(call|send|customer)/i.test(d)) {
      followups.push(`- ${t.id}: ${t.description}`);
    } else {
      low.push(`- ${t.id}: ${t.description}`);
    }
    if (/(waiting on|pending|approval|art)/i.test(d)) {
      blocked.push(`- ${t.id}: ${t.description}`);
    }
  }

  for (const file of orderFiles) {
    const md = readFileSafe(file);
    if (/deposit/i.test(md) && /(not received|missing|false)/i.test(md)) {
      highCash.push(`- ${path.basename(file, ".md")}: deposit not received`);
    }
    const next = firstLineAfterSection(md, "Next Action");
    if (!next) blocked.push(`- ${path.basename(file, ".md")}: missing Next Action`);
    if (/waiting on|pending|approval|art/i.test(md)) {
      blocked.push(`- ${path.basename(file, ".md")}: blocked dependency noted`);
    }
  }

  for (const file of customerFiles) {
    const md = readFileSafe(file);
    const commitments = firstLineAfterSection(md, "Open Commitments");
    const next = firstLineAfterSection(md, "Next Action");
    if (commitments && commitments !== "- (none)") {
      followups.push(`- ${path.basename(file, ".md")}: ${commitments}`);
    }
    if (next && next !== "TBD") {
      followups.push(`- ${path.basename(file, ".md")}: next action -> ${next}`);
    }
    if (staleOver30Days(md)) {
      reactivation.push(`- ${path.basename(file, ".md")}: no recent update in 30+ days`);
    }
    if (/waiting on|pending|approval/i.test(md)) {
      blocked.push(`- ${path.basename(file, ".md")}: blocking language found`);
    }
  }

  const uniq = (arr) => [...new Set(arr)];
  const highCashTop = uniq(highCash).slice(0, 5);
  const followupTop = uniq(followups).slice(0, 5);
  const reactTop = uniq(reactivation).slice(0, 5);
  const lowTop = uniq(low).slice(0, 5);
  const blockedTop = uniq(blocked).slice(0, 5);
  const totalOpp = highCashTop.length + followupTop.length + reactTop.length + lowTop.length;

  const salesMd = `---
type: intel
generated: ${new Date().toISOString()}
id: sales-opportunities
item_count: ${totalOpp}
---

## 🔴 High Probability Cash
${highCashTop.join("\n") || "- (none)"}

## 🟡 Follow-Ups Needed
${followupTop.join("\n") || "- (none)"}

## 🔵 Reactivation Targets
${reactTop.join("\n") || "- (none)"}

## ⚪ Low Priority
${lowTop.join("\n") || "- (none)"}

## Last Updated
${new Date().toISOString()}
`;

  const blockedMd = `---
type: intel
generated: ${new Date().toISOString()}
id: blocked-items
item_count: ${blockedTop.length}
---

## 🚧 Blocked Items
${blockedTop.join("\n") || "- (none)"}

## Last Updated
${new Date().toISOString()}
`;

  const calls = [];
  calls.push(...highCashTop);
  calls.push(...followupTop);
  calls.push(...reactTop);
  const callTop = uniq(calls).slice(0, 5);

  const callMd = `---
type: call-list
generated: ${new Date().toISOString()}
id: ${todayIso()}
item_count: ${callTop.length}
---

## 📞 CALL THESE TODAY

${callTop
  .map((c, i) => `### ${i + 1}. ${c.replace(/^- /, "")}
Reason: Revenue progression opportunity
Expected Outcome: deposit / quote close / approval / reactivation`)
  .join("\n\n") || "- (none)"}
`;

  fs.writeFileSync(salesPath, salesMd, "utf8");
  fs.writeFileSync(blockedPath, blockedMd, "utf8");
  fs.mkdirSync(path.dirname(callListPath), { recursive: true });
  fs.writeFileSync(callListPath, callMd, "utf8");

  return {
    opportunities: totalOpp,
    blocked: blockedTop.length,
    calls: callTop.length
  };
}

module.exports = generateRevenueIntel;
