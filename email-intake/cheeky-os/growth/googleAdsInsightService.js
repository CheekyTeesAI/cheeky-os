"use strict";

/**
 * Google Ads intelligence — ANALYSIS ONLY. Imports JSON reports locally, never touches Google Ads API.
 */

const fs = require("fs");
const path = require("path");

const taskQueue = require("../agent/taskQueue");

const DATA_FILE = "google-ads-insights.json";

function dataPath() {
  taskQueue.ensureDirAndFiles();
  return path.join(taskQueue.DATA_DIR, DATA_FILE);
}

function guardrailEcho() {
  return (
    "You are the Cheeky Tees operational + growth AI co-pilot. Never execute high-impact actions; never mutate ad spend automatically; " +
    "analyze using imported metrics only; drafts and recommendations stay approval-gated; if confidence is low, say so."
  );
}

/** @returns {object} */
function readInsightsSafe() {
  const p = dataPath();
  if (!fs.existsSync(p))
    return {
      generatedAt: null,
      campaigns: [],
      localMarketInsight: "",
      note: "insufficient_data — import a Google Ads report JSON to populate this layer.",
      warningCampaignCount: 0,
      guardrailEcho: guardrailEcho(),
    };
  try {
    const j = JSON.parse(fs.readFileSync(p, "utf8"));
    if (!j || typeof j !== "object") throw new Error("bad shape");
    j.guardrailEcho = guardrailEcho();
    return j;
  } catch (_e) {
    return {
      generatedAt: null,
      campaigns: [],
      corrupted: true,
      note: "Insight file unreadable — re-import cleanly.",
      warningCampaignCount: 0,
      guardrailEcho: guardrailEcho(),
    };
  }
}

/**
 * Persist merged insights (validated additive).
 *
 * @param {object} body
 */
function importReport(body) {
  const b = body && typeof body === "object" ? body : {};
  /** @type {object[]} */
  const campaignsIn = Array.isArray(b.campaigns) ? b.campaigns : [];
  /** @type {object[]} */
  const analyzed = [];

  let warningCampaignCount = 0;
  campaignsIn.slice(0, 200).forEach((raw) => {
    if (!raw || typeof raw !== "object") return;
    const name = String(raw.name || raw.campaignName || "").slice(0, 200);
    const impressions = Math.max(0, Number(raw.impressions || raw.imprs || 0));
    const clicks = Math.max(0, Number(raw.clicks || 0));
    const cost = Math.max(0, Number(raw.costUsd != null ? raw.costUsd : raw.cost || raw.spendUsd || 0));
    let ctr =
      impressions > 0 && clicks >= 0
        ? Math.round((clicks / impressions) * 10000) / 100
        : "unknown";
    const cpc =
      clicks > 0 ? Math.round((cost / clicks) * 100) / 100 : impressions > 0 && cost > 0 ? "unknown" : "unknown";

    let wastedSpendCents = 0;
    /** low CTR with meaningful spend heuristic */
    if (typeof ctr === "number" && ctr < 0.85 && impressions > 2500 && cost > 75) wastedSpendCents = Math.round(cost * 35);

    /** local geo heuristic */
    const blob = `${name} ${String(raw.keywordTheme || "")}`.toLowerCase();
    let localLift = "";
    if (/greenville|fountain inn|simpsonville|gvl|south carolina|\bsc\b/.test(blob))
      localLift = "Detected Upstate SC locality — tighten radius + callouts for trades + schools proximity.";
    if (/rush|deadline|event day|tomorrow/.test(blob))
      localLift = (localLift ? localLift + " " : "") + "Rush language present — tie landing page to SLA + proof turnaround.";

    /** severity */
    let severity = "low";
    const issues = [];
    if (cost > 120 && clicks < 3 && impressions > 4000) {
      severity = "high";
      issues.push("Spend with almost no clicks — paused review recommended (human executes).");
      warningCampaignCount += 1;
    } else if (typeof ctr === "number" && ctr < 1.1 && impressions > 1500) {
      severity = "medium";
      issues.push("CTR is trailing versus typical SMB apparel search — revisit creative + intent.");
      warningCampaignCount += 1;
    }
    if (wastedSpendCents > 0) {
      issues.push("Potential wasted spend heuristic from low engagement + scaled impressions.");
      if (severity === "low") severity = "medium";
    }

    analyzed.push({
      name,
      impressions,
      clicks,
      ctr,
      costUsdApprox: Math.round(cost * 100) / 100,
      cpcUsdApprox: cpc,
      wastedSpendCents,
      localMarketInsight: localLift || "Import geo segments for sharper Greenville corridor reads.",
      issues,
      severity,
      correlationNote:
        quoteConversionCorrelationNote(name, raw.quoteToLeadSignals) || "Insufficient quote-conversion linkage in import — correlate manually with Cheeky OS KPI layer.",
      focusThemes: summarizeFocusThemes(name),
      guardrailEcho: guardrailEcho(),
    });
  });

  const rollup = analyzeRollups(analyzed);

  const doc = {
    generatedAt: new Date().toISOString(),
    reportDate:
      typeof b.reportDate === "string" ? b.reportDate.slice(0, 32) : new Date().toISOString().slice(0, 10),
    campaigns: analyzed,
    rollup,
    note: analyzed.length ? `Imported ${analyzed.length} campaign row(s); analysis only — drafts live separately.` : "insufficient_data",
    warningCampaignCount,
    seasonalHint: rollup.seasonalHint,
    trustNote: analyzed.length ? guardrailEcho() : "",
    guardrailEcho: guardrailEcho(),
  };

  const p = dataPath();
  const tmp = `${p}.tmp.${Date.now()}`;
  fs.writeFileSync(tmp, JSON.stringify(doc, null, 2), "utf8");
  fs.renameSync(tmp, p);
  return doc;
}

function summarizeFocusThemes(name) {
  const n = `${name || ""}`.toLowerCase();
  const chips = [];
  if (/shirt|screen|embroid|dtg|print/i.test(n)) chips.push("custom apparel lane");
  if (/school|team|district|coach/.test(n)) chips.push("schools & teams");
  if (/church|ministry/.test(n)) chips.push("churches");
  if (/construction|roof|electric|hvac|plumb|trade/.test(n)) chips.push("trades");
  if (/corp|staff|business|uniform|polo/.test(n)) chips.push("local business uniforms");
  if (!chips.length) chips.push("custom tees & merch");
  return chips.slice(0, 5);
}

/**
 * Optional field on campaign row `{ convertedQuotes: number, clicks: ... }`
 */
function quoteConversionCorrelationNote(name, sig) {
  if (!sig || typeof sig !== "object") return null;
  const q = Number(sig.convertedQuotes || 0);
  const lc = Number(sig.leads || 0);
  if (!(lc >= 12)) return null;
  const ratio = q / lc;
  if (ratio < 0.18)
    return `Quote conversion linkage on "${name.slice(0, 60)}" reads soft (${Math.round(ratio * 100)}%) — QA landing page proof + turnaround promise before scaling bids.`;
  return null;
}

function analyzeRollups(rows) {
  if (!rows.length)
    return {
      totalSpendApprox: 0,
      weightedCtrPct: null,
      wasteSignals: [],
      seasonalHint: "",
    };
  let spend = 0;
  let ctrNum = [];
  rows.forEach((r) => {
    spend += Number(r.costUsdApprox || 0);
    if (typeof r.ctr === "number") ctrNum.push(Number(r.ctr));
  });

  /** Simple seasonal heuristic (month bucket) — uses Date only, not fabricated KPIs */
  const m = new Date().getMonth() + 1;
  let seasonalHint = "";
  if (m === 11 || m === 12)
    seasonalHint = "Holiday volume window typical for spirit wear — tighten negative keywords against gift-only intent.";
  else if (m >= 7 && m <= 9)
    seasonalHint = "Back-to-school uplift likely — elevate school/program ad groups with proof creatives.";
  else seasonalHint = "Standard planning window — keep rush-order proof points visible for local timelines.";

  const wasteSignals = [];
  rows
    .filter((r) => r.severity === "high")
    .slice(0, 6)
    .forEach((r) => wasteSignals.push(`High attention: ${r.name}`));

  return {
    totalSpendApprox: Math.round(spend * 100) / 100,
    weightedCtrPct: ctrNum.length ? Math.round((ctrNum.reduce((a, b) => a + b, 0) / ctrNum.length) * 100) / 100 : null,
    wasteSignals,
    seasonalHint,
  };
}

module.exports = {
  readInsightsSafe,
  importReport,
  guardrailEcho,
};
