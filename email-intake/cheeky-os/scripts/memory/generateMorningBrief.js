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

function parseBulletsFromSection(md, sectionTitle) {
  const marker = `## ${sectionTitle}`;
  const idx = md.indexOf(marker);
  if (idx < 0) return [];
  const lines = md.slice(idx + marker.length).split(/\r?\n/);
  const out = [];
  for (const line of lines) {
    if (line.startsWith("## ")) break;
    if (line.trim().startsWith("- ")) out.push(line.trim().replace(/^- /, ""));
  }
  return out;
}

function parseCallTitles(md) {
  return md
    .split(/\r?\n/)
    .map((line) => line.match(/^###\s+\d+\.\s+(.*)$/))
    .filter(Boolean)
    .map((m) => m[1].trim());
}

function generateMorningBrief() {
  const root = path.join(__dirname, "../../");
  const overdueMd = readSafe(path.join(root, "tasks/overdue.md"));
  const salesMd = readSafe(path.join(root, "intel/sales-opportunities.md"));
  const callMd = readSafe(path.join(root, `outputs/call-lists/${todayIso()}.md`));
  const outPath = path.join(root, `briefs/morning/${todayIso()}.md`);

  const cash = parseBulletsFromSection(salesMd, "🔴 High Probability Cash").slice(0, 3);
  const calls = parseCallTitles(callMd).slice(0, 3);
  const risks = [
    ...parseBulletsFromSection(overdueMd, "🔴 OVERDUE TASKS"),
    ...parseBulletsFromSection(salesMd, "⚪ Low Priority")
  ].slice(0, 3);

  const focusLead = cash[0] || calls[0] || risks[0] || "clear one high-impact revenue blocker";
  const content = `---
type: morning-brief
generated: ${new Date().toISOString()}
---

## 🔴 MUST DO TODAY

${cash.map((x) => `- ${x}`).join("\n") || "- No cash-critical actions found"}

---

## 📞 CALL LIST

${calls.map((x) => `- ${x}`).join("\n") || "- No calls queued"}

---

## ⚠️ RISKS

${risks.map((x) => `- ${x}`).join("\n") || "- No major risks detected"}

---

## 🧠 FOCUS

What matters most today is ${focusLead}.
`;

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, content, "utf8");
  return { path: outPath };
}

module.exports = generateMorningBrief;
