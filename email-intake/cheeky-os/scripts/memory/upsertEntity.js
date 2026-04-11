const fs = require("fs");
const path = require("path");

const TYPE_DIR_MAP = {
  customer: "customers",
  vendor: "vendors",
  order: "orders",
  relationship: "relationships"
};

function nowIso() {
  return new Date().toISOString();
}

function nowHistoryStampUtc() {
  const iso = new Date().toISOString();
  const d = iso.slice(0, 10);
  const t = iso.slice(11, 16);
  return `${d} ${t} UTC`;
}

function getEntityPath(type, id) {
  const folder = TYPE_DIR_MAP[type];
  if (!folder) throw new Error("Invalid entity type");
  return path.join(__dirname, `../../memory/${folder}/${id}.md`);
}

function buildTemplate(id, iso) {
  return `---
type: entity
id: ${id}
created: ${iso}
updated: ${iso}
status: active
last_action_at: ${iso}
tags: []
---

## Summary

## Current Status

## Open Commitments

## Next Action

## Risk Flags

## Notes

## History Log

---
`;
}

function setFrontmatterValue(md, key, value) {
  const rx = new RegExp(`^${key}:\\s*.*$`, "m");
  if (rx.test(md)) return md.replace(rx, `${key}: ${value}`);
  const firstDivider = md.indexOf("---\n");
  if (firstDivider !== 0) return md;
  const secondDivider = md.indexOf("\n---", 4);
  if (secondDivider < 0) return md;
  return md.slice(0, secondDivider) + `\n${key}: ${value}` + md.slice(secondDivider);
}

function replaceSectionContent(md, sectionName, newContent) {
  const header = `## ${sectionName}`;
  const start = md.indexOf(header);
  if (start < 0) {
    console.warn(`[MEMORY] Missing section: ${sectionName}`);
    return md;
  }

  const headerEnd = md.indexOf("\n", start);
  if (headerEnd < 0) {
    console.warn(`[MEMORY] Invalid section format: ${sectionName}`);
    return md;
  }

  const nextSection = md.indexOf("\n## ", headerEnd + 1);
  const docDivider = md.lastIndexOf("\n---");
  let sectionEnd = nextSection >= 0 ? nextSection : md.length;
  if (docDivider > headerEnd && docDivider < sectionEnd) {
    sectionEnd = docDivider;
  }
  const formatted = `\n\n${String(newContent ?? "").trim()}\n`;
  return md.slice(0, headerEnd + 1) + formatted + md.slice(sectionEnd);
}

function appendHistory(md, entry) {
  const header = "## History Log";
  const start = md.indexOf(header);
  if (start < 0) {
    console.warn("[MEMORY] Missing section: History Log");
    return md;
  }
  const headerEnd = md.indexOf("\n", start);
  const nextSection = md.indexOf("\n## ", headerEnd + 1);
  const docDivider = md.lastIndexOf("\n---");
  let sectionEnd = nextSection >= 0 ? nextSection : md.length;
  if (docDivider > headerEnd && docDivider < sectionEnd) {
    sectionEnd = docDivider;
  }
  const line = `- [${nowHistoryStampUtc()}] ${entry}`;
  const current = md.slice(headerEnd + 1, sectionEnd).trim();
  const merged = current ? `${current}\n${line}` : line;
  return md.slice(0, headerEnd + 1) + `\n\n${merged}\n` + md.slice(sectionEnd);
}

function upsertEntity({ type, id, fields, historyEntry } = {}) {
  const filePath = getEntityPath(type, id);
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const iso = nowIso();
  let isNew = false;
  let md;

  if (!fs.existsSync(filePath)) {
    isNew = true;
    md = buildTemplate(id, iso);
  } else {
    md = fs.readFileSync(filePath, "utf8");
  }

  const safeFields = fields || {};
  if (safeFields.summary !== undefined) {
    md = replaceSectionContent(md, "Summary", safeFields.summary);
  }
  if (safeFields.openCommitments !== undefined) {
    md = replaceSectionContent(md, "Open Commitments", safeFields.openCommitments);
  }
  if (safeFields.nextAction !== undefined) {
    md = replaceSectionContent(md, "Next Action", safeFields.nextAction);
  }
  if (safeFields.riskFlags !== undefined) {
    md = replaceSectionContent(md, "Risk Flags", safeFields.riskFlags);
  }
  if (safeFields.notes !== undefined) {
    md = replaceSectionContent(md, "Notes", safeFields.notes);
  }
  if (safeFields.status !== undefined) {
    md = setFrontmatterValue(md, "status", safeFields.status);
    md = replaceSectionContent(md, "Current Status", safeFields.status);
  }

  if (historyEntry) {
    md = appendHistory(md, historyEntry);
  }

  md = setFrontmatterValue(md, "updated", iso);
  md = setFrontmatterValue(md, "last_action_at", iso);

  fs.writeFileSync(filePath, md, "utf8");

  return {
    upserted: true,
    path: filePath,
    isNew
  };
}

module.exports = upsertEntity;
