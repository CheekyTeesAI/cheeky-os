"use strict";

/**
 * Deterministic "what now?" co-pilot (no outbound LLM — recommendation only).
 */

const fs = require("fs");
const path = require("path");

const taskQueue = require("../agent/taskQueue");

const STORE = "last-what-now.json";

function storePath() {
  taskQueue.ensureDirAndFiles();
  return path.join(taskQueue.DATA_DIR, STORE);
}

function readCachedBrief() {
  try {
    const p = storePath();
    if (!fs.existsSync(p)) return null;
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch (_e) {
    return null;
  }
}

function writeCachedBrief(payload) {
  try {
    const tmp = `${storePath()}.tmp.${Date.now()}`;
    fs.writeFileSync(tmp, JSON.stringify(payload, null, 2), "utf8");
    fs.renameSync(tmp, storePath());
  } catch (_e) {}
}

async function buildWhatNowBrief() {
  try {
    const blockerFirstDashboardService = require("../dashboard/blockerFirstDashboardService");
    const frictionLogService = require("../ops/frictionLogService");
    const approvalGateService = require("../approvals/approvalGateService");
    const garmentOrderDraftService = require("../drafting/garmentOrderDraftService");
    const workOrderDraftService = require("../drafting/workOrderDraftService");
    const followUpDraftService = require("../drafting/followUpDraftService");

    const playbookGenerator = require("../ops/playbookGenerator");
    const googleAdsInsightService = require("../growth/googleAdsInsightService");

    const envelope = await blockerFirstDashboardService.buildBlockerFirstEnvelope();
    const friction = frictionLogService.tailRecent(5);

    /** @type {object[]} */
    let recurringFrictionPatterns = [];
    /** @type {string[]} */
    let recurringAdSignalsSummary = [];
    try {
      recurringFrictionPatterns = playbookGenerator.detectFrictionHotspots(10);
      recurringAdSignalsSummary = playbookGenerator.recurringAdSignals(
        googleAdsInsightService.readInsightsSafe().campaigns || []
      );
    } catch (_phase4Sig) {
      recurringFrictionPatterns = [];
      recurringAdSignalsSummary = [];
    }

    /** @type {object[]} */
    let phase2Approvals = [];
    try {
      phase2Approvals = approvalGateService.getPendingApprovals();
    } catch (_p2a) {
      phase2Approvals = [];
    }
    const pendingApprovalCount = phase2Approvals.length;

    /** @type {object[]} */
    let consolidationOpportunities = [];
    try {
      const cg = await garmentOrderDraftService.consolidateGarmentNeeds();
      consolidationOpportunities = (cg.consolidationOpportunities || []).slice(0, 8);
    } catch (_cgx) {
      consolidationOpportunities = [];
    }

    /** @type {object} */
    let draftsAvailable = {};
    try {
      draftsAvailable = {
        workOrders: workOrderDraftService.listPendingWorkOrderDrafts().slice(0, 12),
        garmentOrders: garmentOrderDraftService.listPendingGarmentDrafts().slice(0, 12),
        followUps: followUpDraftService.listPendingFollowUpDrafts().slice(0, 12),
      };
    } catch (_dr) {
      draftsAvailable = { workOrders: [], garmentOrders: [], followUps: [] };
    }

    const topBlockers =
      envelope.sections &&
      envelope.sections[0] &&
      Array.isArray(envelope.sections[0].cards)
        ? envelope.sections[0].cards.slice(0, 8)
        : [];

    const cashSection = envelope.sections && envelope.sections[1];
    let lead = blockerLead(topBlockers, cashSection);
    if (pendingApprovalCount > 0) {
      lead = `${pendingApprovalCount} approval gate ticket(s) are waiting—Patrick signs customer + cash moves. Then: ${lead}`;
    }

    const proactiveSuggestion =
      consolidationOpportunities.length &&
      consolidationOpportunities[0] &&
      consolidationOpportunities[0].orderCount >= 2
        ? consolidationOpportunities.length +
          " garment bundle(s) flagged—merge Carolina Made carts after approval, not before Patrick okays blanks spend."
        : pendingApprovalCount
          ? `${pendingApprovalCount} gated drafts/decisions unresolved—stay in VISIBILITY→DRAFT→APPROVE before any outbound action.`
          : "Queues look lighter—still generate drafts (work order / garment / follow-up) instead of texting from memory.";

    const recommendedActions = [
      {
        who: "Patrick",
        instruction:
          pendingApprovalCount > 0
            ? `1. Clear ${pendingApprovalCount} cockpit approval(s). 2. Review cash risks from Square snapshot before releasing garments.`
            : topBlockers.length
              ? "1. Knock down the hottest blocker listed (deposit/art/vendor). 2. Sweep approvals even when counts look zero."
              : "1. Spot-check Square snapshot + approvals file. 2. Keep deposit rules tight before any spend.",
      },
      {
        who: "Jeremy",
        instruction:
          jerkInstruction(envelope) +
          " Never send email/SMS, never place vendor orders, never flip production status inside Cheeky OS—draft internally, approval first.",
      },
      {
        who: "Team",
        instruction:
          friction.length >= 1
            ? `${friction.length} fresh friction marker(s)—fix root cause tomorrow, today keep logging.`
            : "Log UX friction anytime the cockpit blocks you—it trains the playbook.",
      },
      {
        who: "Floor process",
        instruction:
          (() => {
            const w = (draftsAvailable.workOrders && draftsAvailable.workOrders.length) || 0;
            const g = (draftsAvailable.garmentOrders && draftsAvailable.garmentOrders.length) || 0;
            const f = (draftsAvailable.followUps && draftsAvailable.followUps.length) || 0;
            return w + g + f > 0
              ? "Review pending drafts tray before rewriting work—reuse the saved JSON drafts on disk."
              : "Nothing pending on disk yet—tap POST /api/drafts/generate when you touch a risky customer lane.";
          })(),
      },
    ];

    const envelopeApprovals = approvalsFromEnvelope(envelope);
    const gateApprovals = phase2Approvals.slice(0, 12).map((a) => ({
      headline: `${a.customer || ""} · ${a.actionType}`.trim(),
      why: String(a.description || "").slice(0, 240),
      suggestedAction: a.requiresPatrick ? "Patrick approves in gate before execution." : "Jeremy may clear only if impact is low + internal-only.",
      approvalRequired: !!a.requiresPatrick,
      idForOps: String(a.id || ""),
      source: "phase2_gate",
      impactLevel: a.impactLevel,
      moneyImpact: a.moneyImpact,
    }));

    const payload = {
      answer: lead,
      topConcern: topBlockers[0]
        ? String(topBlockers[0].blockerReason || topBlockers[0].whatToDoNext || "unknown").slice(0, 220)
        : pendingApprovalCount
          ? `${pendingApprovalCount} approval gate item(s) waiting.`
          : "No critical blocker in current snapshot.",
      topBlockers: topBlockers.map(summarizeBlockingCard),
      recommendedActions,
      jeremyInstructions:
        jerkInstruction(envelope) +
        " Use drafts + approvals only—no autonomous execution from this cockpit.",
      patrickApprovals: envelopeApprovals.concat(gateApprovals).slice(0, 20),
      cashRisks: summarizeCash(cashSection),
      productionRisks: summarizeProd(envelope),
      consolidationOpportunities,
      proactiveSuggestion,
      pendingApprovalCount,
      frictionRecent: friction,
      recurringFrictionPatterns,
      recurringAdSignalsSummary,
      draftsAvailable,
      changedSinceYesterday:
        friction.length >= 1
          ? `${friction.length} fresh friction log item(s) entered recently.`
          : "No new friction spikes detected from tail snapshot.",
      jeremyFinishToday:
        jerkInstruction(envelope) +
        " Finish READY FOR JEREMY cards before touching growth or ad-review lanes.",
      patrickReviewTonight:
        `${pendingApprovalCount} gate item(s) pending; review approvals + cash risk + ads warnings in one nightly pass.`,
      generatedAt: new Date().toISOString(),
    };

    writeCachedBrief(payload);
    return Object.assign({}, payload, { cached: false });
  } catch (_e) {
    const prev = readCachedBrief();
    if (prev) {
      return Object.assign({}, prev, {
        degraded: true,
        answer: `${prev.answer || ""}\n(NOTE: Serving last cached co-pilot — fresh build failed safely.)`,
      });
    }
    return degradedStub();
  }
}

function jerkInstruction(envelope) {
  try {
    const readySec = envelope.sections && envelope.sections.find((s) => s.title === "READY FOR JEREMY");
    const cards = readySec && Array.isArray(readySec.cards) ? readySec.cards : [];
    const real = cards.filter((c) => String(c.id || "").startsWith("jeremy-ready-"));
    const n = real.length;
    const prodBlk = envelope.sections && envelope.sections.find((s) => s.title === "PRODUCTION BLOCKERS");
    const pb =
      prodBlk && prodBlk.cards
        ? prodBlk.cards.filter((c) => c.blockerType && c.blockerType !== "none").length
        : 0;

    if (n === 0) {
      return "Jeremy: no PRODUCTION_READY jobs listed — help Patrick clear deposits, art, and garment receipts so cards land in READY FOR JEREMY.";
    }

    const firstCustomer =
      (real[0] && real[0].customer) || (cards[0] && cards[0].customer) || "the next customer in queue";

    if (pb > 0) {
      return `Jeremy: run up to ${Math.min(n, 3)} ready job(s) first; ${pb} other production blockers still need Patrick/vendor before expanding. Start with ${firstCustomer} after your normal safety check.`;
    }
    return `Jeremy: ${n} job card(s) are ready for the floor — pull next from PRODUCTION READY for ${firstCustomer}.`;
  } catch (_e2) {
    return "Jeremy: open READY FOR JEREMY on the dashboard — brief hiccup assembling text, but lane data still loads.";
  }
}

function approvalsFromEnvelope(envelope) {
  const sec = envelope.sections && envelope.sections.find((s) => s.title === "APPROVALS NEEDED");
  const cs = sec && Array.isArray(sec.cards) ? sec.cards : [];
  return cs.slice(0, 12).map((c) => ({
    headline: `${c.customer || ""} · ${c.orderName || ""}`.trim(),
    why: String(c.blockerReason || ""),
    suggestedAction: String(c.whatToDoNext || ""),
    approvalRequired: !!c.approvalRequired,
    idForOps: String(c.id || ""),
  }));
}

function summarizeCash(sec) {
  if (!sec || !Array.isArray(sec.cards)) return [];
  return sec.cards.slice(0, 15).map(summarizeBlockingCard);
}

function summarizeProd(envelope) {
  const sec = envelope.sections && envelope.sections.find((s) => s.title === "PRODUCTION BLOCKERS");
  if (!sec || !sec.cards) return [];
  return sec.cards.slice(0, 15).map(summarizeBlockingCard);
}

function summarizeBlockingCard(c) {
  const due = c.dueDate ? String(c.dueDate) : null;
  let daysUntilDue = null;
  if (due) {
    try {
      daysUntilDue = Math.ceil((new Date(due).getTime() - Date.now()) / 86400000);
    } catch (_e4) {
      daysUntilDue = null;
    }
  }
  return {
    id: c.id,
    label: `${c.customer || ""} · ${c.orderName || ""}`.trim(),
    blocker: c.blockerReason,
    instructions: c.whatToDoNext,
    moneyImpact: c.moneyImpact,
    prodImpact: c.productionImpact,
    dueDate: due,
    daysUntilDue,
  };
}

function blockerLead(blockers, cashSection) {
  const deadly =
    cashSection &&
    cashSection.cards &&
    cashSection.cards.find((x) => x.blockerType === "unpaid_invoice");
  const blk = blockers && blockers.length ? blockers[0] : null;

  if (deadly) {
    return `Most urgent cash risk: unpaid Square invoice (${deadly.customer || deadly.orderName}). Keep deposit rules tight — Patrick aligns payment before production spends more time.`;
  }
  if (blk && blk.blockerType !== "none") {
    return `Most urgent blocker: ${blk.customer || blk.orderName} — ${blk.blockerReason}`;
  }
  return "Nothing screaming in the blocker lane — still glance approvals + READY FOR JEREMY so Jeremy stays fed.";
}

function degradedStub() {
  const now = new Date().toISOString();
  return {
    answer: "Briefing unavailable — dashboards still load with safe placeholders. Retry after DB/Square stable.",
    topBlockers: [],
    recommendedActions: [
      { who: "Patrick", instruction: "Stay in read-only mode; no auto actions fire from Cheeky OS." },
      { who: "Jeremy", instruction: "Prep station only until PRODUCTION_READY cards return." },
    ],
    jeremyInstructions: "Jeremy: hold for explicit Patrick go-ahead if READY FOR JEREMY is empty.",
    patrickApprovals: [],
    cashRisks: [],
    productionRisks: [],
    consolidationOpportunities: [],
    proactiveSuggestion: "Reload cockpit after services settle—drafts still save locally when DB is back.",
    pendingApprovalCount: 0,
    frictionRecent: [],
    recurringFrictionPatterns: [],
    recurringAdSignalsSummary: [],
    draftsAvailable: { workOrders: [], garmentOrders: [], followUps: [] },
    topConcern: "unknown",
    changedSinceYesterday: "insufficient_data",
    jeremyFinishToday: "unknown",
    patrickReviewTonight: "unknown",
    generatedAt: now,
    degraded: true,
  };
}

module.exports = {
  buildWhatNowBrief,
  getCachedWhatNowBrief: readCachedBrief,
  getDegradedStub: degradedStub,
};
