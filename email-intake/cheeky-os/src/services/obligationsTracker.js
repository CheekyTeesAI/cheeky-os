"use strict";

const fs = require("fs");
const path = require("path");

function toUrgency(daysUntilDue) {
  if (daysUntilDue <= 3) return "critical";
  if (daysUntilDue <= 7) return "high";
  if (daysUntilDue <= 14) return "medium";
  return "low";
}

function getUpcomingObligations() {
  const file = path.join(__dirname, "..", "..", "..", "..", "data", "known-obligations.json");
  try {
    const raw = fs.readFileSync(file, "utf8");
    const parsed = JSON.parse(raw);
    const now = Date.now();
    return (Array.isArray(parsed) ? parsed : []).map((o) => {
      const dueDate = new Date(o.dueDate);
      const daysUntilDue = Number.isNaN(dueDate.getTime()) ? null : Math.ceil((dueDate.getTime() - now) / (24 * 60 * 60 * 1000));
      return {
        id: o.id || `obl-${Math.random().toString(36).slice(2, 8)}`,
        type: o.type || "unknown",
        label: o.label || "Unknown obligation",
        amount: Number(o.amount || 0),
        dueDate: o.dueDate || null,
        urgency: daysUntilDue === null ? "medium" : toUrgency(daysUntilDue),
        certainty: o.certainty || "unknown",
        source: o.source || "operator-maintained",
        daysUntilDue,
        notes: o.notes || "",
      };
    });
  } catch (_) {
    return [];
  }
}

module.exports = {
  getUpcomingObligations,
};
