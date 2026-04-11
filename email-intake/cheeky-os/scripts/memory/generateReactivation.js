const fs = require("fs");
const path = require("path");

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function readSafe(filePath) {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return "";
  }
}

function listCustomerFiles(dirPath) {
  try {
    return fs
      .readdirSync(dirPath)
      .filter((x) => x.endsWith(".md") && x !== ".gitkeep")
      .map((x) => path.join(dirPath, x));
  } catch {
    return [];
  }
}

function nameFromFile(md, file) {
  return md.match(/^#\s+(.+)$/m)?.[1]?.trim() || path.basename(file, ".md").replace(/-/g, " ");
}

function staleOver30(md) {
  const m = md.match(/^updated:\s*([0-9T:\-\.Z]+)/m);
  if (!m) return false;
  const d = new Date(m[1]);
  if (Number.isNaN(d.getTime())) return false;
  return Date.now() - d.getTime() > 30 * 24 * 60 * 60 * 1000;
}

function generateReactivation() {
  const root = path.join(__dirname, "../../");
  const files = listCustomerFiles(path.join(root, "memory/customers"));
  const targets = [];

  for (const file of files) {
    const md = readSafe(file);
    if (!staleOver30(md)) continue;
    targets.push(nameFromFile(md, file));
  }

  const top = [...new Set(targets)].slice(0, 5);
  const body = `## REACTIVATION

---

${top
  .map(
    (name) => `### ${name}

Message:
"Hey ${name} — it's been a minute.
Got anything coming up we can help with?
We’ve got openings this week if you need something quick."

---`
  )
  .join("\n\n") || "### None\n\nMessage:\n\"Hey there — it's been a minute.\nGot anything coming up we can help with?\nWe’ve got openings this week if you need something quick.\"\n\n---"}
`;

  const outPath = path.join(root, "outputs/email-drafts", `reactivation-${todayIso()}.md`);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, body, "utf8");
  return { generated: top.length, path: outPath };
}

module.exports = generateReactivation;
