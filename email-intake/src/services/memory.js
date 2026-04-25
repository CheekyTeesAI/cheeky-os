const fs = require("fs");
const path = require("path");
const memoryService = require("./memoryService.js");

const MEMORY_PATH = path.join(__dirname, "..", "..", "data", "memory.json");
const MAX_DECISIONS = 1500;

function readStore() {
  try {
    const raw = fs.readFileSync(MEMORY_PATH, "utf8");
    const doc = JSON.parse(raw);
    if (!Array.isArray(doc.decisions)) doc.decisions = [];
    return doc;
  } catch {
    return { decisions: [] };
  }
}

function writeStore(doc) {
  fs.mkdirSync(path.dirname(MEMORY_PATH), { recursive: true });
  fs.writeFileSync(MEMORY_PATH, JSON.stringify(doc, null, 2), "utf8");
}

function logDecision(category, input, output, outcome, notes) {
  const row = {
    timestamp: new Date().toISOString(),
    category: String(category || "general"),
    input: input == null ? "" : input,
    output: output == null ? "" : output,
    outcome: String(outcome || "recorded"),
    notes: String(notes || ""),
  };
  const doc = readStore();
  doc.decisions.push(row);
  if (doc.decisions.length > MAX_DECISIONS) {
    doc.decisions = doc.decisions.slice(-MAX_DECISIONS);
  }
  writeStore(doc);
  try {
    memoryService.logEvent("decision_logged", {
      category: row.category,
      outcome: row.outcome,
    });
  } catch (_) {
    /* optional */
  }
  return row;
}

function getInsights(category) {
  const doc = readStore();
  const filter = String(category || "").trim().toLowerCase();
  const rows = filter
    ? doc.decisions.filter((d) => String(d.category || "").toLowerCase() === filter)
    : doc.decisions;
  const byOutcome = {};
  for (const r of rows) {
    const key = String(r.outcome || "unknown");
    byOutcome[key] = (byOutcome[key] || 0) + 1;
  }
  return {
    category: filter || "all",
    count: rows.length,
    outcomes: byOutcome,
    recent: rows.slice(-25).reverse(),
  };
}

async function generateKaizenSummary() {
  const doc = readStore();
  const recent = doc.decisions.slice(-120);
  if (!recent.length) {
    return "No decisions logged yet. Start by logging invoice/report/sales outcomes.";
  }
  try {
    const aiSummary = await memoryService.analyzeMemory();
    return aiSummary;
  } catch {
    const insights = getInsights("");
    const topOutcome = Object.entries(insights.outcomes).sort((a, b) => b[1] - a[1])[0];
    return `Recent decisions: ${insights.count}. Top outcome: ${topOutcome ? `${topOutcome[0]} (${topOutcome[1]})` : "n/a"}. Focus on reducing failed/unknown outcomes and improving follow-up conversion.`;
  }
}

module.exports = {
  logDecision,
  getInsights,
  generateKaizenSummary,
};
