"use strict";

const classifier = require("./operatorIntentClassifier");
const reasoner = require("./operatorReasoner");

let _normTry = null;
let _mapperTry = null;

/**
 * Jarvis NL orchestrator (no autonomous execution — use liveExecutionOrchestrator from HTTP).
 * @param {string} query
 * @param {object} [options]
 */
function processNaturalLanguage(query, options) {
  try {
    const opts = options && typeof options === "object" ? options : {};
    let normalized = String(query || "").trim();
    try {
      if (opts.normalizeVoice !== false && !_normTry) _normTry = require("../voice/voiceCommandNormalizer");
      if (opts.normalizeVoice !== false && _normTry && typeof _normTry.normalizeVoiceCommand === "function") {
        normalized = _normTry.normalizeVoiceCommand(normalized).normalizedText || normalized;
      }
    } catch (_vn) {}

    try {
      if (!_mapperTry) _mapperTry = require("../voice/voiceActionMapper");
      if (_mapperTry && typeof _mapperTry.mapVoiceToIntentHint === "function") {
        const hint = _mapperTry.mapVoiceToIntentHint(normalized);
        if (hint && hint.intentHint) opts.intentHint = hint.intentHint;
      }
    } catch (_vm) {}

    const cl = classifier.classifyOperatorIntent(query, normalized);
    if (opts.intentHint && typeof opts.intentHint === "string") {
      cl.intent = opts.intentHint;
      cl.confidence = Math.max(cl.confidence, 0.62);
    }

    const pack = reasoner.gatherOperationalReasoning(cl.intent, normalized, opts);

    /** @type {string[]} */
    const answerParts = [];
    try {
      answerParts.push(`Top focus: ${pack.focusRecommendations && pack.focusRecommendations[0] ? pack.focusRecommendations[0].title : "Review priority engine output"}.`);
    } catch (_a0) {}
    try {
      if (pack.riskSummaries && pack.riskSummaries.length) {
        answerParts.push(`Risks: ${pack.riskSummaries.slice(0, 3).join(" | ")}`);
      }
    } catch (_a1) {}
    try {
      if (cl.intent === "memory_retrieval" && pack.relatedMemory && Array.isArray(pack.relatedMemory.related)) {
        const n = Math.min(3, pack.relatedMemory.related.length);
        answerParts.push(`Memory: ${n} related artifact(s) (semantic engine).`);
      }
    } catch (_a2) {}
    try {
      if (cl.intent === "financial" && pack.dashboard && pack.dashboard.revenue) {
        const inv = pack.dashboard.revenue.unpaidInvoices || {};
        answerParts.push(`Finance snapshot — unpaid rows ≈ ${inv.unpaidCount || 0}; outstanding ≈ ${(Number(inv.outstandingCents || 0) / 100).toFixed(2)} (local JSON).`);
      }
    } catch (_a3) {}
    try {
      if (cl.intent === "production" && pack.dashboard && pack.dashboard.production) {
        const pr = pack.dashboard.production;
        answerParts.push(
          `Production — queue≈${pr.queueSize}; late≈${pr.lateJobsApprox}; missing art≈${pr.missingArt}.`
        );
      }
    } catch (_a4) {}

    const answer = answerParts.filter(Boolean).join(" ") || pack.operationalReasoning || "Operational pass complete.";

    /** @type {object[]} */
    const recommendedActions = [];
    try {
      for (let i = 0; i < Math.min(8, (pack.prioritizedActions || []).length); i++) {
        recommendedActions.push(pack.prioritizedActions[i]);
      }
    } catch (_ra) {}

    try {
      const oce = require("../memory/operationalContinuityEngine");
      oce.recordInteractionTurn({
        kind: "nl_query",
        query: normalized.slice(0, 1600),
        intent: cl.intent,
        confidence: cl.confidence,
      });
    } catch (_oc) {}

    try {
      const tl = require("../diagnostics/executionTimeline");
      tl.appendTimelineEvent({ phase: "query", note: "natural_language_engine", intent: cl.intent });
    } catch (_tl) {}

    return {
      query: normalized,
      intent: cl.intent,
      answer,
      recommendedActions,
      risks: pack.riskSummaries || [],
      confidence: cl.confidence,
      sources: pack.sources || [],
      _internal: {
        priorities: pack.priorities,
        recommendations: pack.recommendations,
        pendingApprovals: pack.pendingApprovals,
      },
    };
  } catch (_e) {
    return {
      query: String(query || ""),
      intent: "operational_summary",
      answer: "Jarvis NL engine failed closed; no operational answer generated.",
      recommendedActions: [],
      risks: ["nl_engine_error"],
      confidence: 0,
      sources: [],
      _internal: {},
    };
  }
}

module.exports = { processNaturalLanguage };
