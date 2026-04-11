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

function parseRiskLines(md) {
  const marker = "## 🔴 CASH AT RISK";
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

function extractName(line) {
  const cleaned = line.replace(/^TASK-\d+\s+—\s+/i, "");
  const first = cleaned.split("—")[0].trim();
  const parts = first.split(/\s+/).filter(Boolean).slice(0, 3);
  return parts.join(" ") || "there";
}

function generateCollections() {
  const root = path.join(__dirname, "../../");
  const cashPath = path.join(root, "intel/cash-at-risk.md");
  const outPath = path.join(root, `outputs/email-drafts/collections-${todayIso()}.md`);
  const md = readSafe(cashPath);
  const risks = parseRiskLines(md).slice(0, 5);

  const names = [...new Set(risks.map(extractName))].slice(0, 5);
  const content = `## COLLECTIONS

---

${names
  .map(
    (name) => `### ${name}

Message:
"Hey ${name} — just checking in on this.
We’re ready to move forward as soon as payment comes through.

Want me to resend the invoice?"

---`
  )
  .join("\n\n") || `### there

Message:
"Hey there — just checking in on this.
We’re ready to move forward as soon as payment comes through.

Want me to resend the invoice?"

---`}
`;

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, content, "utf8");
  return { collections: names.length || 1, path: outPath };
}

module.exports = generateCollections;
