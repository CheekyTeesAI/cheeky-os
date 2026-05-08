"use strict";

/**
 * Google Ads draft recommendations — persisted JSON + approval gate. NEVER mutates ad accounts.
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const taskQueue = require("../agent/taskQueue");
const approvalGateService = require("../approvals/approvalGateService");
const insightSvc = require("./googleAdsInsightService");

const FILE = "google-ads-drafts.json";

function pathDrafts() {
  taskQueue.ensureDirAndFiles();
  return path.join(taskQueue.DATA_DIR, FILE);
}

function readDraftsDoc() {
  const p = pathDrafts();
  if (!fs.existsSync(p))
    return { items: [], note: null };
  try {
    const j = JSON.parse(fs.readFileSync(p, "utf8"));
    return j && typeof j === "object" ? j : { items: [] };
  } catch (_e) {
    return { items: [], note: "recoverable_parse_error" };
  }
}

function writeDraftsDoc(doc) {
  const p = pathDrafts();
  const tmp = `${p}.tmp.${Date.now()}`;
  fs.writeFileSync(tmp, JSON.stringify(doc, null, 2), "utf8");
  fs.renameSync(tmp, p);
}

function newId() {
  try {
    if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  } catch (_e) {}
  return `gad-${Date.now()}`;
}

/** @returns {{ items: object[], approvalsCreated: object[] }} */
function generateDraftsFromInsights(insightsDoc) {
  const base = insightsDoc && typeof insightsDoc === "object" ? insightsDoc : insightSvc.readInsightsSafe();
  const campaigns = Array.isArray(base.campaigns) ? base.campaigns : [];
  /** @type {object[]} */
  const newItems = [];
  /** @type {object[]} */
  const approvals = [];

  if (!campaigns.length) return { items: [], approvalsCreated: [], note: "insufficient_data" };

  campaigns
    .filter((c) => c && ["medium", "high"].indexOf(String(c.severity || "").toLowerCase()) >= 0)
    .slice(0, 12)
    .forEach((c) => {
      const id = newId();
      const issueDetected = (Array.isArray(c.issues) && c.issues[0]) || "Optimization opportunity surfaced from CTR/CPC heuristics.";
      const severity = String(c.severity || "low").toLowerCase();
      /** @type {object} */
      const draft = {
        id,
        campaignName: String(c.name || "Campaign"),
        issueDetected,
        severity,
        recommendedChange:
          severity === "high"
            ? "Pause or narrow this campaign AFTER Patrick reviews drafts — tighten keywords + split proof-led RSA."
            : "Test tighter keyword themes + freshness on headlines before increasing bids.",
        estimatedImpact:
          severity === "high"
            ? "Higher efficiency if wasted click path is trimmed (metric-driven heuristic only)."
            : "Incremental CTR lift expected if creatives match Greenville/trades apparel intent.",
        estimatedRevenueOpportunity:
          typeof c.wastedSpendCents === "number" && c.wastedSpendCents > 0 ? Math.round(c.wastedSpendCents / 100) : "unknown",
        adCopyDrafts: buildAdDrafts(String(c.name || "")),
        keywordRecommendations: buildKeywordAdds(String(c.name || "")),
        negativeKeywords: buildNegatives(String(c.name || ""), c),
        landingPageIdeas: buildLandingIdeas(String(c.name || ""), c.localMarketInsight),
        localMarketInsight:
          typeof c.localMarketInsight === "string" && c.localMarketInsight
            ? c.localMarketInsight
            : "Serve Greenville • Fountain Inn • Simpsonville trust signals plus rush capability footnote.",
        approvalRequired: true,
        generatedAt: new Date().toISOString(),
        guardrailEcho: insightSvc.guardrailEcho(),
      };

      /** optional approval linkage */
      let approval = null;
      try {
        approval = approvalGateService.createApproval({
          actionType: "google_ads_optimization_draft",
          customer: draft.campaignName,
          description:
            `${issueDetected.slice(0, 160)} Draft id ${id}. No mutating Google Ads accounts from Cheeky OS — Jeremy/Patrick decide externally.`,
          impactLevel: severity === "high" ? "high" : "medium",
          moneyImpact: "ads_efficiency_optional",
          requestedBy: "phase4-google-ads-draft",
          draftPayload: { draftId: id, outreachTypeHint: null },
          aiExplanation: `${insightSvc.guardrailEcho()} Imported metrics only.`,
        });
        approvals.push(approval);
      } catch (_eAp) {}

      draft.approvalId = approval ? approval.id : null;
      newItems.push(draft);
    });

  const existing = readDraftsDoc();
  const prevItems = Array.isArray(existing.items) ? existing.items : [];
  const merged = prevItems.concat(newItems);
  writeDraftsDoc({
    items: merged.slice(-240),
    approvalsCreatedHints: approvals.length,
    savedAt: new Date().toISOString(),
  });

  return { items: newItems, approvalsCreated: approvals };
}

function buildAdDrafts(theme) {
  const t = theme.toLowerCase();
  const locality = ["Greenville-area teams & trades", "Fountain Inn same-week rush when schedule allows"];

  /** @type {object[]} */
  const out = [
    {
      headline: `${theme.slice(0, 42)} • Screen printing that ships on time`,
      description: `Trusted local decorator for tees, fleece, uniforms. ${locality[0]}. (${insightSvc.guardrailEcho().slice(
        0,
        80
      )}…)`,
    },
    {
      headline: `${theme.slice(0, 30)} DTG detail + embroidery accents`,
      description:
        "Small-batch friendly with proof checkpoints — no autopilot sending; book a human review. Fountain Inn pickup / ship options when schedule allows.",
    },
  ];
  if (/rush|school|team/.test(t))
    out.push({
      headline: "Spirit wear + booster bundles without chaos",
      description: "We queue jobs with approvals first — aligns with deposit discipline + production truth.",
    });
  return out;
}

function buildKeywordAdds(theme) {
  const base = [`${theme} screen printing Greenville`, `${theme} embroidery near Fountain Inn`, "rush t shirts simpsonville sc"];
  if (/trade|electric|roof|construction/.test(theme.toLowerCase()))
    base.push("trade apparel printing south carolina", "company uniforms dtg Greenville");
  if (/school|team/.test(theme.toLowerCase()))
    base.push("team shirts Greenville SC booster", "school spirit wear fundraiser printing");
  return base.slice(0, 12);
}

function buildNegatives(theme, cRaw) {
  const negs = [
    "free t shirt",
    "how to diy screen print job",
    "download template only",
    "roblox merch",
    "international wholesale blank only",
  ];
  if (/screen|shirt|shirt/i.test(theme) && !(cRaw && typeof cRaw.costUsdApprox === "number" && cRaw.costUsdApprox < 40))
    negs.push("cheapest bulk china");
  return negs;
}

function buildLandingIdeas(theme, localityLine) {
  return [
    "Above-fold proof gallery with production timeline + Rush disclaimer",
    localityLine ||
      "Map module showing Greenville corridor service area with testimonial carousel for trades + schools.",
    "CTA anchors to intake form that mirrors approvals-first policy (trust > automation copy).",
  ];
}

/** @returns {object[]} last N campaign-shaped recommendations */
function listRecommendations(limit) {
  const ins = insightSvc.readInsightsSafe();
  const rows = Array.isArray(ins.campaigns) ? ins.campaigns : [];
  const n = Math.min(60, Math.max(4, Number(limit) || 20));
  return rows.slice(-n).map((c) => ({
    campaignName: c.name,
    severity: c.severity,
    issues: c.issues,
    ctr: c.ctr,
    cpcUsdApprox: c.cpcUsdApprox,
    localMarketInsight: c.localMarketInsight,
    wastedSpendCents: c.wastedSpendCents,
    focusThemes: c.focusThemes || [],
    guardrailEcho: insightSvc.guardrailEcho(),
  }));
}

module.exports = {
  generateDraftsFromInsights,
  readDraftsDoc,
  listRecommendations,
};
