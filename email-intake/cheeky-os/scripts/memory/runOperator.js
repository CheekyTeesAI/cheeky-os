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

function parseSectionBullets(md, sectionTitle) {
  const sectionMarker = `## ${sectionTitle}`;
  const start = md.indexOf(sectionMarker);
  if (start < 0) return [];
  const after = md.slice(start + sectionMarker.length);
  const lines = after.split(/\r?\n/);
  const out = [];
  for (const line of lines) {
    if (line.startsWith("## ")) break;
    if (line.trim().startsWith("- ")) out.push(line.trim().replace(/^- /, ""));
  }
  return out;
}

function parseCallList(md) {
  const lines = md.split(/\r?\n/);
  const out = [];
  let current = null;
  for (const line of lines) {
    const item = line.match(/^###\s+\d+\.\s+(.*)$/);
    if (item) {
      if (current) out.push(current);
      current = { title: item[1].trim(), reason: "", outcome: "" };
      continue;
    }
    if (!current) continue;
    const reason = line.match(/^Reason:\s*(.*)$/);
    if (reason) current.reason = reason[1].trim();
    const outcome = line.match(/^Expected Outcome:\s*(.*)$/);
    if (outcome) current.outcome = outcome[1].trim();
  }
  if (current) out.push(current);
  return out;
}

function toActionText(item) {
  const whoMatch = item.title.match(/^([^:—-]+)/);
  const who = whoMatch ? whoMatch[1].trim() : "Owner";
  return {
    what: item.title,
    who,
    why: item.reason || "Revenue progression opportunity",
    result: item.outcome || "Cash movement"
  };
}

function runOperator() {
  const root = path.join(__dirname, "../../");
  const overduePath = path.join(root, "tasks/overdue.md");
  const salesPath = path.join(root, "intel/sales-opportunities.md");
  const blockedPath = path.join(root, "intel/blocked-items.md");
  const cashRiskPath = path.join(root, "intel/cash-at-risk.md");
  const callListPath = path.join(root, `outputs/call-lists/${todayIso()}.md`);
  const reportPath = path.join(root, `outputs/reports/operator-${todayIso()}.md`);

  const overdueMd = readFileSafe(overduePath);
  const salesMd = readFileSafe(salesPath);
  const blockedMd = readFileSafe(blockedPath);
  const cashRiskMd = readFileSafe(cashRiskPath);
  const callsMd = readFileSafe(callListPath);

  const cashRiskItems = parseSectionBullets(cashRiskMd, "🔴 CASH AT RISK");
  const cashItems = parseSectionBullets(salesMd, "🔴 High Probability Cash");
  const overdueItems = parseSectionBullets(overdueMd, "🔴 OVERDUE TASKS");
  const blockedItems = parseSectionBullets(blockedMd, "🚧 Blocked Items");
  const oppItems = parseSectionBullets(salesMd, "🟡 Follow-Ups Needed");
  const callItems = parseCallList(callsMd);

  const actions = [];

  // 1) CASH AT RISK first
  for (const item of cashRiskItems) {
    if (actions.length >= 5) break;
    const who = item.split("—")[0].trim() || "Customer";
    actions.push({
      what: `Collect payment from ${who}`,
      who,
      why: "Payment is open and blocks production/cash conversion.",
      result: "Payment captured and order cleared to move"
    });
  }

  // 2) Cash opportunities
  for (const call of callItems) {
    if (actions.length >= 5) break;
    actions.push(toActionText(call));
  }
  for (const item of cashItems) {
    if (actions.length >= 5) break;
    actions.push({
      what: `Contact ${item}`,
      who: "Customer",
      why: "Deposit/quote/invoice signal indicates near-term cash.",
      result: "Deposit collected or deal closed"
    });
  }

  // 3) Overdue critical tasks
  for (const item of overdueItems) {
    if (actions.length >= 5) break;
    actions.push({
      what: `Complete overdue task: ${item}`,
      who: "Owner",
      why: "Overdue tasks increase missed revenue risk.",
      result: "Reduced rollover and faster close cycle"
    });
  }

  // 4) Blocked items
  for (const item of blockedItems) {
    if (actions.length >= 5) break;
    actions.push({
      what: `Unblock: ${item}`,
      who: "Vendor/Customer",
      why: "Blocking dependency is stopping cash flow.",
      result: "Order or payment moves forward"
    });
  }

  // 5) Other opportunities
  for (const item of oppItems) {
    if (actions.length >= 5) break;
    actions.push({
      what: `Follow up: ${item}`,
      who: "Customer",
      why: "Open follow-up signal tied to possible close.",
      result: "Quote response or next-step commitment"
    });
  }

  const deduped = [];
  const seen = new Set();
  for (const a of actions) {
    const key = a.what.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(a);
    if (deduped.length >= 5) break;
  }

  const watch = blockedItems.slice(0, 2);
  const quickWins = [
    `${cashItems.slice(0, 2).length} follow-ups likely to close`,
    `${parseSectionBullets(salesMd, "🔵 Reactivation Targets").slice(0, 1).length} reactivation candidate`
  ];

  const report = `---
type: operator-report
generated: ${new Date().toISOString()}
---

## 🔥 DO THIS NOW

${deduped
  .map(
    (a, i) => `### ${i + 1}. ${a.what}
Why: ${a.why}
Result: ${a.result}`
  )
  .join("\n\n") || "### 1. Review today pipeline\nWhy: No strong actions found in inputs\nResult: Prevent missed opportunities"}

---

## ⚠️ WATCH

${watch.map((x) => `- ${x}`).join("\n") || "- No major blockers detected"}

---

## 💰 QUICK WINS

${quickWins.map((x) => `- ${x}`).join("\n")}

---

## DONE = SUCCESS

If these 5 actions are completed, today is a win.
`;

  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, report, "utf8");

  return {
    actions: deduped,
    reportPath
  };
}

module.exports = runOperator;
