const fs = require("fs");
const path = require("path");

const TRIGGERS = [
  "i will",
  "i'll",
  "need to",
  "follow up",
  "call",
  "send",
  "check with",
  "waiting on",
  "by tomorrow",
  "next week"
];

function isoDate(dateObj) {
  return dateObj.toISOString().slice(0, 10);
}

function dueFromText(text) {
  const lower = text.toLowerCase();
  const now = new Date();
  if (lower.includes("tomorrow")) {
    const d = new Date(now.getTime());
    d.setUTCDate(d.getUTCDate() + 1);
    return isoDate(d);
  }
  if (lower.includes("next week")) {
    const d = new Date(now.getTime());
    d.setUTCDate(d.getUTCDate() + 7);
    return isoDate(d);
  }
  return null;
}

function priorityFromText(text) {
  const lower = text.toLowerCase();
  if (
    lower.includes("today") ||
    lower.includes("asap") ||
    lower.includes("deposit") ||
    lower.includes("urgent") ||
    lower.includes("deadline")
  ) {
    return "high";
  }
  if (
    lower.includes("follow up") ||
    lower.includes("customer") ||
    lower.includes("call") ||
    lower.includes("send")
  ) {
    return "medium";
  }
  return "low";
}

function splitCandidateTasks(rawText) {
  const normalized = String(rawText || "").replace(/\s+/g, " ").trim();
  if (!normalized) return [];
  const chunks = normalized.split(/\band\b|,/i).map((x) => x.trim()).filter(Boolean);
  const verbCount = (normalized.match(/\b(call|send|follow up|check with|confirm|review|need to|i will|i'll)\b/gi) || []).length;
  if (verbCount >= 2 && /\band\b/i.test(normalized) && !/[.,;!?]/.test(normalized)) {
    return [normalized];
  }
  return chunks.filter((chunk) => {
    const lower = chunk.toLowerCase();
    return TRIGGERS.some((t) => lower.includes(t));
  });
}

function ensureMasterFile(filePath) {
  if (fs.existsSync(filePath)) return;
  const template = `---
type: task-master
updated: ISO_TIMESTAMP
open_count: 0
---

## Tasks

---
`;
  fs.writeFileSync(filePath, template, "utf8");
}

function appendTaskBlock(markdown, task) {
  const marker = "## Tasks";
  const idx = markdown.indexOf(marker);
  if (idx < 0) return markdown + "\n" + renderTask(task);
  const insertAt = idx + marker.length;
  const entry = `\n\n${renderTask(task)}`;
  return markdown.slice(0, insertAt) + entry + markdown.slice(insertAt);
}

function renderTask(task) {
  return `### ${task.id}

- Description: ${task.description}
- Source: ${task.source}
- Due: ${task.due || "null"}
- Priority: ${task.priority}
- Status: open
- Rollover Count: 0
- Escalation Level: 0
- Last Updated: ${task.lastUpdated}`;
}

function extractTasks(rawText) {
  const root = path.join(__dirname, "../../");
  const filePath = path.join(root, "tasks/master_tasks.md");
  ensureMasterFile(filePath);

  let markdown = fs.readFileSync(filePath, "utf8");
  const candidates = splitCandidateTasks(rawText);
  const today = isoDate(new Date());
  const tasks = [];
  let nextId = 1;

  for (const c of candidates) {
    const description = c.replace(/\s+/g, " ").trim();
    if (!description) continue;
    if (markdown.toLowerCase().includes(`- description: ${description.toLowerCase()}`)) {
      continue;
    }
    const task = {
      id: `TASK-${String(nextId).padStart(3, "0")}`,
      description,
      source: rawText,
      due: dueFromText(description),
      priority: priorityFromText(description),
      lastUpdated: today
    };
    nextId += 1;
    markdown = appendTaskBlock(markdown, task);
    tasks.push(task);
  }

  const openCount = (markdown.match(/^- Status: open$/gim) || []).length;
  const updatedIso = new Date().toISOString();
  markdown = markdown.replace(/^updated:\s*.*$/m, `updated: ${updatedIso}`);
  markdown = markdown.replace(/^open_count:\s*.*$/m, `open_count: ${openCount}`);
  fs.writeFileSync(filePath, markdown, "utf8");

  return {
    extracted: tasks.length,
    tasks
  };
}

module.exports = extractTasks;
