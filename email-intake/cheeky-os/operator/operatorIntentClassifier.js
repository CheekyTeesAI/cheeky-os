"use strict";

/**
 * Heuristic NL intent classification (read-only; no side effects).
 * @returns {{ intent: string, confidence: number, entities: object, priority: string }}
 */
function classifyOperatorIntent(queryText, voiceNormalized) {
  try {
    const raw = String(voiceNormalized != null ? voiceNormalized : queryText || "").trim();
    const q = raw.toLowerCase();
    /** @type {object} */
    const entities = { tokens: raw.slice(0, 400), contactHints: [], moneyHints: false };
    /** @type {string} */
    let intent = "operational_summary";
    let confidence = 0.55;
    let priority = "normal";

    try {
      const contactMatch = q.match(/\b(from|about|with|Jessica|[\w.]+@[\w.]+\.[a-z]{2,})\b/i);
      if (contactMatch) entities.contactHints.push(String(contactMatch[0]));
    } catch (_e0) {}

    try {
      if (/\$\d|invoice|unpaid|risk|cash|deposit|deposit|billing|collections|margins?/.test(q)) {
        intent = "financial";
        confidence = 0.78;
        entities.moneyHints = true;
      }
    } catch (_e1) {}

    try {
      if (/production|floor|print|embroider|qc|blanks?|art file|work order|due date|late job/.test(q)) {
        intent = "production";
        confidence = Math.max(confidence, 0.76);
      }
    } catch (_e2) {}

    try {
      if (/email|say|inbox|twilio|sms|customer said|reply|draft comms|reach out/.test(q)) {
        intent = "communication";
        confidence = Math.max(confidence, 0.72);
      }
    } catch (_e3) {}

    try {
      if (/plan|roadmap|next week|schedule|sequence|dependencies/.test(q)) {
        intent = "planning";
        confidence = Math.max(confidence, 0.68);
      }
    } catch (_e4) {}

    try {
      if (/health|diagnostic|incident|outage|lock|stale|error|failed task|rate limit/.test(q)) {
        intent = "diagnostics";
        confidence = Math.max(confidence, 0.74);
      }
    } catch (_e5) {}

    try {
      if (/remember|similar|last time|like this job|related task|history memory/.test(q)) {
        intent = "memory_retrieval";
        confidence = Math.max(confidence, 0.7);
      }
    } catch (_e6) {}

    try {
      if (/most important|what should we focus|summarize the business|what matters|big picture/.test(q)) {
        intent = "operational_summary";
        confidence = Math.max(confidence, 0.82);
        priority = "high";
      }
    } catch (_e7) {}

    try {
      if (/urgent|rush|now|critical|blocking revenue/.test(q)) priority = "high";
    } catch (_e8) {}

    return { intent, confidence: Math.min(1, confidence), entities, priority };
  } catch (_e) {
    return {
      intent: "operational_summary",
      confidence: 0.4,
      entities: {},
      priority: "normal",
    };
  }
}

module.exports = { classifyOperatorIntent };
