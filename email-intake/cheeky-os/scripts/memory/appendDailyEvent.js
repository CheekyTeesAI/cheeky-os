const fs = require("fs");
const path = require("path");
const createDailyFile = require("./createDailyFile");

const VALID_SECTIONS = new Set([
  "Events Log",
  "Promises Made",
  "Cash Moves",
  "Risks Surfaced"
]);

function toIsoDateUtc(dateObj) {
  return dateObj.toISOString().slice(0, 10);
}

function toTimeUtc(dateObj) {
  return dateObj.toISOString().slice(11, 16);
}

function appendDailyEvent({ date, section, content, timestamp } = {}) {
  if (!VALID_SECTIONS.has(section)) {
    throw new Error("Invalid section");
  }

  const dateStr = date ? String(date) : toIsoDateUtc(new Date());
  createDailyFile(dateStr);

  const filePath = path.join(__dirname, "../../memory/daily", `${dateStr}.md`);
  const nowIso = new Date().toISOString();
  const hhmm = timestamp ? String(timestamp) : toTimeUtc(new Date());
  const entry = `- [${hhmm} UTC] ${content}`;

  let markdown;
  try {
    markdown = fs.readFileSync(filePath, "utf8");
  } catch (err) {
    console.error("[MEMORY] Failed reading daily file:", err.message);
    return { appended: false, section, path: filePath };
  }

  const sectionHeader = `## ${section}`;
  const sectionIndex = markdown.indexOf(sectionHeader);
  if (sectionIndex < 0) {
    throw new Error("Section not found");
  }

  // Update frontmatter updated field
  markdown = markdown.replace(/^updated:\s*.*$/m, `updated: ${nowIso}`);

  const headerEnd = markdown.indexOf("\n", sectionIndex);
  if (headerEnd < 0) {
    throw new Error("Section not found");
  }

  const insertAt = headerEnd + 1;
  const insertion = `\n${entry}\n`;
  const next = markdown.slice(0, insertAt) + insertion + markdown.slice(insertAt);

  fs.writeFileSync(filePath, next, "utf8");

  return {
    appended: true,
    section,
    path: filePath
  };
}

module.exports = appendDailyEvent;
