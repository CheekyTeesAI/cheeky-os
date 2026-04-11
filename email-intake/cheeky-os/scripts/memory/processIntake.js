const fs = require("fs");
const path = require("path");
const classifyIntake = require("./classifyIntake");
const appendDailyEvent = require("./appendDailyEvent");
const extractTasks = require("./extractTasks");
const upsertEntity = require("./upsertEntity");

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function hhmmUtc() {
  return new Date().toISOString().slice(11, 16);
}

function normalizeForTasks(rawText) {
  // Replace " and " with ". " only when both sides contain action verbs.
  return String(rawText || "").replace(
    /(\b(?:call|send|follow up|check with|confirm|review)\b[^.?!]*?)\s+\band\b\s+([^.?!]*?\b(?:call|send|follow up|check with|confirm|review)\b[^.?!]*)/gi,
    "$1. $2"
  );
}

function writeIntakeReport(entry) {
  const date = todayIso();
  const reportPath = path.join(__dirname, `../../outputs/reports/intake-${date}.md`);
  const updated = new Date().toISOString();
  const header = `---
type: intake-report
id: ${date}
updated: ${updated}
---

## Intake Events

`;
  const block = `### [${hhmmUtc()} UTC] Intake Processed
- Category: ${entry.category}
- Confidence: ${entry.confidence}
- Summary: ${entry.summary}
- Tasks Extracted: ${entry.tasksExtracted}
- Entity Updated: ${entry.entityUpdated ? "yes" : "no"}
- Entity Path: ${entry.entityPath || "null"}

---
`;

  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  if (!fs.existsSync(reportPath)) {
    fs.writeFileSync(reportPath, header + block, "utf8");
    return reportPath;
  }
  let md = fs.readFileSync(reportPath, "utf8");
  md = md.replace(/^updated:\s*.*$/m, `updated: ${updated}`);
  const marker = "## Intake Events";
  const idx = md.indexOf(marker);
  if (idx >= 0) {
    const insertAt = idx + marker.length;
    md = md.slice(0, insertAt) + `\n\n${block}` + md.slice(insertAt);
  } else {
    md += `\n\n## Intake Events\n\n${block}`;
  }
  fs.writeFileSync(reportPath, md, "utf8");
  return reportPath;
}

function processIntake(rawText, options = {}) {
  const text = String(rawText || "").trim();
  const classification = classifyIntake(text);

  const daily = appendDailyEvent({
    section: "Events Log",
    content: `Processed intake: ${classification.summary}`
  });

  const normalized = normalizeForTasks(text);
  const extracted = extractTasks(normalized);

  let entityUpdated = false;
  let entityPath = null;
  const canCreateEntity =
    classification.strongEntityCandidate === true &&
    classification.confidence !== "low" &&
    classification.suggestedEntityType &&
    classification.suggestedEntityId;

  if (canCreateEntity || options.forceEntity === true) {
    try {
      const entityType = classification.suggestedEntityType || "relationship";
      const entityId =
        classification.suggestedEntityId ||
        String(text.split(/\s+/).slice(0, 3).join("-")).toLowerCase().replace(/[^a-z0-9-]/g, "");
      const result = upsertEntity({
        type: entityType,
        id: entityId,
        fields: {
          summary: classification.summary,
          status: "active",
          nextAction: extracted.tasks[0] ? extracted.tasks[0].description : "Review intake details",
          notes: text
        },
        historyEntry: "Intake processed from raw text"
      });
      entityUpdated = true;
      entityPath = result.path;
    } catch (err) {
      entityUpdated = false;
      entityPath = null;
    }
  }

  if (!entityUpdated && (classification.confidence === "low" || !classification.strongEntityCandidate)) {
    appendDailyEvent({
      section: "Risks Surfaced",
      content: "Low-confidence intake routed to daily log without forced entity creation."
    });
  }

  const reportPath = writeIntakeReport({
    category: classification.category,
    confidence: classification.confidence,
    summary: classification.summary,
    tasksExtracted: extracted.extracted,
    entityUpdated,
    entityPath
  });

  return {
    ok: true,
    classification,
    dailyEventAppended: Boolean(daily && daily.appended),
    tasksExtracted: extracted.extracted,
    entityUpdated,
    entityPath,
    reportPath
  };
}

module.exports = processIntake;
