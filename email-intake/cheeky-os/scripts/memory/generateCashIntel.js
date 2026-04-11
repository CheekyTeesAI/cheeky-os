const fs = require("fs");
const path = require("path");

function readSafe(filePath) {
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

function parseTasks(md) {
  const lines = md.split(/\r?\n/);
  const out = [];
  let id = "";
  let desc = "";
  let status = "open";
  for (const line of lines) {
    if (line.startsWith("### TASK-")) {
      if (id) out.push({ id, desc, status });
      id = line.replace("### ", "").trim();
      desc = "";
      status = "open";
      continue;
    }
    let m = line.match(/^- Description:\s*(.*)$/);
    if (m) desc = m[1].trim();
    m = line.match(/^- Status:\s*(.*)$/);
    if (m) status = m[1].trim().toLowerCase();
  }
  if (id) out.push({ id, desc, status });
  return out;
}

function firstLineAfterSection(md, section) {
  const marker = `## ${section}`;
  const idx = md.indexOf(marker);
  if (idx < 0) return "";
  return (
    md
      .slice(idx + marker.length)
      .split(/\r?\n/)
      .map((x) => x.trim())
      .filter(Boolean)[0] || ""
  );
}

function generateCashIntel() {
  const root = path.join(__dirname, "../../");
  const ordersDir = path.join(root, "memory/orders");
  const tasksPath = path.join(root, "tasks/master_tasks.md");
  const salesPath = path.join(root, "intel/sales-opportunities.md");
  const outPath = path.join(root, "intel/cash-at-risk.md");

  const risks = [];
  const watch = [];

  const orderFiles = listMarkdown(ordersDir);
  for (const file of orderFiles) {
    const md = readSafe(file);
    const name = path.basename(file, ".md").replace(/-/g, " ");
    const hasDepositRequired = /deposit_required\s*:\s*([1-9]\d*|[0-9]+\.[0-9]+)/i.test(md) || /deposit required/i.test(md);
    const noDeposit = /deposit_received\s*:\s*0/i.test(md) || /deposit received\s*:\s*false/i.test(md) || /deposit not received/i.test(md);
    if (hasDepositRequired && noDeposit) {
      risks.push(`- ${name} — no deposit received`);
    }
    if (/invoice sent/i.test(md) && !/paid/i.test(md)) {
      risks.push(`- ${name} — invoice sent, payment still open`);
    }
  }

  const taskMd = readSafe(tasksPath);
  const tasks = parseTasks(taskMd).filter((t) => t.status === "open");
  for (const t of tasks) {
    const d = (t.desc || "").toLowerCase();
    if (/waiting on payment|invoice sent|deposit/.test(d)) {
      risks.push(`- ${t.id} — ${t.desc}`);
    }
  }

  const salesMd = readSafe(salesPath);
  const followups = firstLineAfterSection(salesMd, "🟡 Follow-Ups Needed");
  if (followups && followups !== "- (none)") {
    watch.push(`- ${followups.replace(/^- /, "")}`);
  }
  const reactivation = firstLineAfterSection(salesMd, "🔵 Reactivation Targets");
  if (reactivation && reactivation !== "- (none)") {
    watch.push(`- ${reactivation.replace(/^- /, "")}`);
  }

  const uniq = (arr) => [...new Set(arr)].slice(0, 5);
  const riskTop = uniq(risks);
  const watchTop = uniq(watch);

  const content = `---
type: intel
generated: ${new Date().toISOString()}
id: cash-risk
item_count: ${riskTop.length}
---

## 🔴 CASH AT RISK

${riskTop.join("\n") || "- (none)"}

---

## ⚠️ WATCH

${watchTop.join("\n") || "- (none)"}
`;

  fs.writeFileSync(outPath, content, "utf8");
  return { cashRisks: riskTop.length, path: outPath };
}

module.exports = generateCashIntel;
