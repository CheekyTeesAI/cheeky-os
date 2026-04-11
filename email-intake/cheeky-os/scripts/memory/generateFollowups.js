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

function parseTasks(md) {
  const lines = md.split(/\r?\n/);
  const out = [];
  let id = "";
  let desc = "";
  for (const line of lines) {
    if (line.startsWith("### TASK-")) {
      if (id && desc) out.push({ id, description: desc });
      id = line.replace("### ", "").trim();
      desc = "";
      continue;
    }
    const m = line.match(/^- Description:\s*(.*)$/);
    if (m) desc = m[1].trim();
  }
  if (id && desc) out.push({ id, description: desc });
  return out;
}

function extractCustomerName(md, fallback) {
  const title = md.match(/^#\s+(.+)$/m)?.[1]?.trim();
  if (title) return title;
  return fallback.replace(/-/g, " ");
}

function generateFollowups() {
  const root = path.join(__dirname, "../../");
  const tasksMd = readSafe(path.join(root, "tasks/master_tasks.md"));
  const salesMd = readSafe(path.join(root, "intel/sales-opportunities.md"));
  const customerFiles = listCustomerFiles(path.join(root, "memory/customers"));
  const tasks = parseTasks(tasksMd);

  const picks = [];

  for (const t of tasks) {
    const low = t.description.toLowerCase();
    if (/follow up|quote|invoice|deposit|payment|call/i.test(low)) {
      picks.push({
        name: "there",
        context: `${t.id}: ${t.description}`
      });
    }
  }

  const salesLines = salesMd
    .split(/\r?\n/)
    .map((x) => x.trim())
    .filter((x) => x.startsWith("- "));
  for (const s of salesLines) {
    picks.push({ name: "there", context: s.replace(/^- /, "") });
  }

  for (const file of customerFiles) {
    const md = readSafe(file);
    const next = (md.match(/## Next Action[\s\S]*?(?:\n## |\n---|$)/) || [""])[0];
    if (/follow|quote|invoice|deposit|call/i.test(next)) {
      picks.push({
        name: extractCustomerName(md, path.basename(file, ".md")),
        context: next.replace(/\s+/g, " ").trim().slice(0, 140)
      });
    }
  }

  const uniq = [];
  const seen = new Set();
  for (const p of picks) {
    const key = `${p.name}|${p.context}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    uniq.push(p);
  }

  const top = uniq.slice(0, 5);
  const body = `## FOLLOW-UPS

---

${top
  .map(
    (x) => `### ${x.name}

Context:
${x.context}

Message:
"Hey ${x.name} — wanted to circle back on this.
We can get it moving whenever you're ready.
Want me to lock it in?"

---`
  )
  .join("\n\n") || "### None\n\nContext:\nNo qualifying follow-ups.\n\nMessage:\n\"Hey there — wanted to circle back on this.\nWe can get it moving whenever you're ready.\nWant me to lock it in?\"\n\n---"}
`;

  const outPath = path.join(root, "outputs/email-drafts", `followups-${todayIso()}.md`);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, body, "utf8");
  return { generated: top.length, path: outPath };
}

module.exports = generateFollowups;
