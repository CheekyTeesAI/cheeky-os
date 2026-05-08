"use strict";

/**
 * Map canonical voice phrases → operatorIntentClassifier hints (advisory).
 * @returns {{ intentHint: string|null, confidence: number, matchedPattern: string|null }}
 */
function mapVoiceToIntentHint(normalizedPhrase) {
  try {
    const q = String(normalizedPhrase || "").toLowerCase();
    if (/unpaid|invoice|billing|deposit|collections/.test(q)) {
      return { intentHint: "financial", confidence: 0.75, matchedPattern: "financial" };
    }
    if (/jeremy|who should print|next print|printer|screen print|embroider/.test(q)) {
      return { intentHint: "production", confidence: 0.7, matchedPattern: "production_operator" };
    }
    if (/what needs approval|approval queue/.test(q)) {
      return { intentHint: "operational_summary", confidence: 0.72, matchedPattern: "approvals_voice" };
    }
    if (/blocking revenue|risk|cash runway/.test(q)) {
      return { intentHint: "financial", confidence: 0.65, matchedPattern: "revenue_risk" };
    }
    return { intentHint: null, confidence: 0.5, matchedPattern: null };
  } catch (_e) {
    return { intentHint: null, confidence: 0.4, matchedPattern: null };
  }
}

module.exports = { mapVoiceToIntentHint };
