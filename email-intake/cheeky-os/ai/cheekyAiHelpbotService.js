"use strict";

/**
 * Cheeky-AI dashboard helpbot — deterministic read-only composer (no LLM package).
 */

const draftHelpers = require("../drafting/draftOrderHelpers");
const approvalGateService = require("../approvals/approvalGateService");
const customerSearchService = require("../customer/customerSearchService");
const frictionLogService = require("../ops/frictionLogService");
const outreachDraftService = require("../growth/outreachDraftService");
const workflowOrderDraft = require("../drafting/workOrderDraftService");
const garmentOrderDraft = require("../drafting/garmentOrderDraftService");
const followUpDraft = require("../drafting/followUpDraftService");
const kpiService = require("../kpi/kpiService");
const googleAdsInsightService = require("../growth/googleAdsInsightService");
const selfServiceIntakeService = require("../intake/selfServiceIntakeService");
const dashboardViewService = require("../dashboard/dashboardViewService");
const chatbotService = require("./chatbotService");

const fs = require("fs");
const path = require("path");
const taskQueue = require("../agent/taskQueue");

const GUARD_MSG =
  "You are Cheeky-AI, the Cheeky Tees dashboard co-pilot: surface blockers first; never send messages; never change order status; never mutate vendors; recommendations only.";

/**
 * Read jeremy playbook first ~120 lines for substring search only.
 *
 * @param {string} q
 */
function searchPlaybookSnippet(q) {
  const ql = String(q || "")
    .trim()
    .toLowerCase()
    .slice(0, 80);
  if (ql.length < 2)
    return { hit: false, lines: [], note: "Query too short for playbook skim." };

  try {
    const p = path.join(taskQueue.DATA_DIR, "jeremy-playbook.md");
    if (!fs.existsSync(p)) return { hit: false, lines: [], note: "jeremy-playbook.md not generated yet." };
    const lines = fs
      .readFileSync(p, "utf8")
      .split("\n")
      .slice(0, 120)
      .filter(Boolean);
    const hits = lines.filter((ln) => ln.toLowerCase().includes(ql));
    return {
      hit: hits.length > 0,
      lines: hits.slice(0, 6),
      note: hits.length ? "Matched lines from jeremy-playbook.md (read-only skim)." : "No playbook line matched this wording.",
    };
  } catch (_e) {
    return { hit: false, lines: [], note: "Could not load playbook snippet safely." };
  }
}

async function matcherOrdersCustomers(qRaw) {
  const q = String(qRaw || "").trim();
  /** @type {{kind:string,label:string,id:string}[]} */
  const matched = [];

  try {
    const orders = await draftHelpers.loadOrdersForDrafts(200);
    const qlow = q.toLowerCase().slice(0, 96);
    const digits = q.replace(/\D/g, "");
    orders.forEach((o) => {
      if (!o) return;
      const hay =
        `${o.customerName || ""}|${o.email || ""}|${o.orderNumber || ""}|${o.id || ""}`.toLowerCase();
      const ok =
        hay.includes(qlow) ||
        (digits.length >= 3 && hay.includes(digits.slice(-10))) ||
        (digits.length >= 3 && String(o.orderNumber || "").includes(digits));
      if (ok && matched.length < 12)
        matched.push({
          kind: "order",
          label: `${o.customerName || o.email || "Customer"} · #${String(o.orderNumber || o.id || "").slice(0, 48)}`,
          id: String(o.id || ""),
        });
    });
  } catch (_e) {
    matched.push({ kind: "order", label: "Order snapshot unavailable — Prisma/connectivity unknown.", id: "" });
  }

  try {
    const env = await customerSearchService.customerSearchEnvelope(q.slice(0, 160));
    if (!env || !env.orders || !env.orders.length) return matched;
    (env.orders || []).slice(0, 10).forEach((row) =>
      matched.push({
        kind: "order_summary",
        label: `${row.reference || "Order"} — ${row.productionStageCustomer || "unknown stage"}`,
        id: String(row.id || ""),
      })
    );
  } catch (_e2) {}

  return matched;
}

async function matcherApprovalsDraftsFriction(qRaw) {
  const qlow = String(qRaw || "").toLowerCase().slice(0, 80);

  /** @type {object[]} */
  const matched = [];

  try {
    const pend = approvalGateService.getPendingApprovals();
    pend.slice(0, 28).forEach((a) => {
      const blob = `${a.description || ""} ${a.customer || ""}`.toLowerCase();
      const hit = !qlow || blob.includes(qlow);
      if (hit || pend.length <= 14)
        matched.push({
          type: "approval",
          label: `Pending gate · ${a.actionType || "action"} · ${String(a.customer || "").slice(0, 72)}`,
          id: String(a.id || ""),
        });
    });
    if (!pend.length) matched.push({ type: "approval", label: "No pending approvals in JSON gate snapshot.", id: "" });
  } catch (_e) {
    matched.push({ type: "approval", label: "Approvals unreadable safely.", id: "" });
  }

  try {
    const w = workflowOrderDraft.listPendingWorkOrderDrafts().slice(0, 8);
    const g = garmentOrderDraft.listPendingGarmentDrafts().slice(0, 8);
    const f = followUpDraft.listPendingFollowUpDrafts().slice(0, 8);
    [
      ["WO", w],
      ["Garment", g],
      ["Follow-up", f],
    ].forEach(([tier, bundle]) =>
      bundle.forEach((d) =>
        matched.push({
          type: "draft_internal",
          label: `${tier} draft · ${String(d.orderId || d.id || "").slice(0, 80)}`,
          id: String(d.id || ""),
        })
      )
    );
  } catch (_e2) {
    matched.push({ type: "draft_internal", label: "Draft list temporarily unavailable.", id: "" });
  }

  try {
    const drafts = outreachDraftService.listOutreachDrafts ? outreachDraftService.listOutreachDrafts() : [];
    drafts.slice(0, 16).forEach((d) => {
      const blob = `${d.customer || ""} ${d.subject || ""}`.toLowerCase();
      if (!qlow || blob.includes(qlow))
        matched.push({
          type: "sales_sequence",
          label: `Outreach draft · ${d.outreachType || "type"} · ${String(d.customer || "").slice(0, 72)}`,
          id: String(d.id || ""),
        });
    });
  } catch (_e3) {}

  try {
    selfServiceIntakeService.listPendingIntake(60).slice(0, 10).forEach((row) =>
      matched.push({
        type: "intake_draft",
        label: `Self-service intake · ${row.name || ""}`,
        id: String(row.id || ""),
      })
    );
  } catch (_e4) {}

  try {
    frictionLogService.tailRecent(18).forEach((r) => {
      const blob = `${r.description || ""} ${r.area || ""}`.toLowerCase();
      if (!qlow || blob.includes(qlow))
        matched.push({
          type: "friction",
          label: `Friction (${r.area || ""})`,
          id: "",
        });
    });
  } catch (_e5) {}

  return matched.slice(0, 40);
}

async function matcherKpisAds() {
  const matched = [];
  try {
    const kpi = await kpiService.buildKpiSummary();
    const snap = kpi.snapshot || {};
    matched.push({
      type: "kpi",
      label: `Revenue30dUsd ${snap.revenue30dUsd != null ? "~" + snap.revenue30dUsd : "insufficient_data"}`,
      id: "",
    });
    matched.push({
      type: "kpi",
      label: `ApprovalsPending ${snap.approvalsPending != null ? "~" + snap.approvalsPending : "unknown"}`,
      id: "",
    });
  } catch (_e) {
    matched.push({ type: "kpi", label: "KPI summary unavailable safely.", id: "" });
  }
  try {
    const ads = googleAdsInsightService.readInsightsSafe();
    matched.push({
      type: "google_ads_insights",
      label: `${(ads.campaigns || []).length} imported campaign rows; warnings ${ads.warningCampaignCount || 0}`,
      id: "",
    });
    if (!(ads.campaigns || []).length && ads.note)
      matched.push({
        type: "google_ads_insights",
        label: String(ads.note).slice(0, 220),
        id: "",
      });
  } catch (_e2) {
    matched.push({ type: "google_ads_insights", label: "Ads insight file unreadable safely.", id: "" });
  }
  return matched;
}

/**
 * @param {string} q
 */
async function searchAcrossSystem(qRaw) {
  const q = String(qRaw || "").trim().slice(0, 420);
  /** @type {string[]} */
  const dataWarnings = [];
  if (!q || q.length < 2) dataWarnings.push("Your search phrase was too short.");

  /** @type {object[]} */
  const matchedEntities = [];

  const pb = searchPlaybookSnippet(q);
  if (pb.hit) {
    matchedEntities.push({ type: "playbook_md", label: "jeremy-playbook.md contains matching wording.", id: "" });
    pb.lines.forEach((ln, i) =>
      matchedEntities.push({ type: "playbook_line", label: ln.slice(0, 420), id: `p${i}` })
    );
  }

  matchedEntities.push(...(await matcherOrdersCustomers(qRaw)));
  matchedEntities.push(...(await matcherApprovalsDraftsFriction(qRaw)));
  matchedEntities.push(...(await matcherKpisAds()));

  return {
    query: q,
    matchedEntities: matchedEntities.slice(0, 40),
    dataWarnings,
  };
}

function classifyIntent(question) {
  const q = String(question || "").toLowerCase();

  /** @type {string[]} */
  const hits = [];
  const mark = (k) => {
    hits.push(k);
  };

  if (/what should jeremy|jeremy.*next/i.test(question)) mark("jeremy_next");
  if (/block.*?cash|cash.*?block/.test(q) || q.includes("blocking cash")) mark("blocking_cash");
  if (q.includes("find customer")) mark("customer_find");
  if (q.includes("explain") && q.includes("block")) mark("explain_block");
  if (q.includes("patrick") && q.includes("approval")) mark("patrick_approval");
  if (q.includes("google ads") || q.includes("review tonight")) mark("google_ads");
  if (q.includes("cash risk") || q.includes("cash at risk")) mark("cash_risk");
  if (/open drafts?|drafts? ready/i.test(question)) mark("drafts_open");
  if (q.includes("worried") || q.includes("system health")) mark("worried");

  const top = hits[0];

  return top ? top : q.length < 2 ? "empty" : "generic";
}

async function composeAnswer(question, modeRaw) {
  const mode = dashboardViewService.normalizeMode(modeRaw);
  const intent = classifyIntent(question);
  const searched = await searchAcrossSystem(question);
  let liveContext = {};
  try {
    const ctx = await chatbotService.gatherOperationalContext();
    liveContext = { wn: ctx.whatNow, mb: ctx.morningBrief, ng: ctx.nightlyReview };
  } catch (_ctx) {
    liveContext = {};
  }

  /** @type {string[]} */
  const recommendedActions = [];

  /** @type {object[]} */
  const dashboardLinks = [];
  dashboardLinks.push({ label: "Dashboard view picker", anchorId: "phase7-dashboard-view-strip", href: "#phase7-dashboard-view-strip" });

  /** @type {string[]} */
  const answerPieces = [];

  if (intent === "jeremy_next" || (mode === "jeremy" && intent === "generic")) {
    answerPieces.push(`${GUARD_MSG} Jeremy lane: skim READY FOR JEREMY in blocker lanes, resolve deposit + garment holds before promising dates on the floor.`);
    recommendedActions.push("Reload cockpit if blocker cards feel stale.");
    dashboardLinks.push({ label: `Intake queue + customer lookup panel`, anchorId: "phase5-jeremy-intake-panel", href: "#phase5-jeremy-intake-panel" });
  }

  if (intent === "blocking_cash" || intent === "cash_risk") {
    answerPieces.push("Cash blockers concentrate in Waiting on Deposit + invoice-published wording inside blocker dashboard cards.");
    recommendedActions.push("Confirm Square-backed invoice state before verbally clearing production.");
    dashboardLinks.push({ label: `Operational blockers lanes`, anchorId: "sections-root", href: "#sections-root" });
  }

  if (intent === "explain_block") {
    answerPieces.push("Each blocker card lists money stakes, production impact, and plain-English ‘what next’ — escalate if multiple jobs share apparel holds.");
    dashboardLinks.push({ label: `What should we do right now`, anchorId: "what-now-panel", href: "#what-now-panel" });
  }

  if (intent === "patrick_approval") {
    answerPieces.push("Patrick-required approvals remain in cockpit pending list until resolved — Jeremy cannot bypass flagged gates.");
    recommendedActions.push("Scroll Pending approvals strip first each morning.");
    dashboardLinks.push({ label: `Pending approvals`, anchorId: "phase2-approvals-section", href: "#phase2-approvals-section" });
    dashboardLinks.push({ label: `JSON pending endpoint`, anchorId: "", href: `/api/approvals/pending` });
  }

  if (intent === "google_ads") {
    answerPieces.push("Google Ads cues import from disk JSON — treat Medium/High warnings as nightly review fodder without auto-changes.");
    recommendedActions.push("Pair ads warnings with KPI summary before reallocating calendar time.");
    dashboardLinks.push({ label: `Google Ads cockpit tiles`, anchorId: "phase4-google-ads", href: "#phase4-google-ads" });
  }

  if (intent === "drafts_open") {
    answerPieces.push("Pending drafting artifacts include WO, garment PO, customer follow-ups, outreach JSON — approvals still mandatory before outbound.");
    dashboardLinks.push({ label: `Drafts ready for review`, anchorId: "phase2-drafts-section", href: "#phase2-drafts-section" });
  }

  if (intent === "worried") {
    answerPieces.push("System worry merges approvals backlog, notification density, friction spikes, stale Square caches, intake queue depth.");
    recommendedActions.push("Read monitoring health envelope + nightly review when growth signals cluster.");
    dashboardLinks.push({ label: `/api/monitoring/system-health`, anchorId: "", href: `/api/monitoring/system-health` });
    dashboardLinks.push({ label: `/api/system/full-status`, anchorId: "", href: `/api/system/full-status` });
  }

  if (intent === "customer_find") {
    answerPieces.push("Lookup uses Phase 5 customer-safe envelope — widen email fragments if nothing returns.");
    dashboardLinks.push({ label: `Safe customer lookup field`, anchorId: "cust-lookup-main", href: "#cust-lookup-main" });
    dashboardLinks.push({ label: `GET customer search endpoint`, anchorId: "", href: `/api/customer/search` });
  }

  if (!answerPieces.length) {
    answerPieces.push(
      `${GUARD_MSG} I scanned local logs below — widen wording or hydrate Prisma if matches feel sparse (no executions performed).`
    );
    recommendedActions.push("Compare matches with blocker cards manually before texting customers.");
  }

  const trimmedMatches = searched.matchedEntities.slice(0, 12).map((m) => {
    const lbl = typeof m.label === "string" ? m.label : "";
    const kind = m.kind || m.type || "item";
    return `${kind}: ${lbl}`.slice(0, 320);
  });

  answerPieces.push(
    trimmedMatches.length ? `Nearby matches (${Math.min(trimmedMatches.length, 5)} preview): ${trimmedMatches.slice(0, 5).join(" · ")}.` : ""
  );
  const topConcern =
    (liveContext.wn && (liveContext.wn.topConcern || liveContext.wn.answer)) ||
    (liveContext.mb && liveContext.mb.topConcern) ||
    "unknown";
  const changedSinceYesterday =
    (liveContext.wn && liveContext.wn.changedSinceYesterday) ||
    (liveContext.mb && liveContext.mb.changedSinceYesterday) ||
    (liveContext.ng && liveContext.ng.changedSinceYesterday) ||
    "insufficient_data";
  const jeremyFinishToday =
    (liveContext.wn && liveContext.wn.jeremyFinishToday) ||
    (liveContext.mb && liveContext.mb.jeremyFinishToday) ||
    "unknown";
  const patrickReviewTonight =
    (liveContext.wn && liveContext.wn.patrickReviewTonight) ||
    (liveContext.ng && liveContext.ng.patrickReviewTonight) ||
    (liveContext.mb && liveContext.mb.patrickReviewTonight) ||
    "unknown";

  return {
    answer: answerPieces.filter(Boolean).join(" "),
    mode,
    intent,
    matchedEntities: searched.matchedEntities.slice(0, 24),
    recommendedActions,
    dashboardLinks,
    confidence:
      trimmedMatches.length && intent !== "empty" ? 0.66 : intent === "empty" ? 0.08 : trimmedMatches.length ? 0.5 : 0.35,
    dataWarnings:
      searched.dataWarnings.concat(
        intent === "empty" ? ["No question captured — try again with at least three words."] : [],
        !trimmedMatches.length ? ["Limited cross-search matches — data may still be hydrating."] : []
      ),
    topConcern: String(topConcern).slice(0, 260),
    changedSinceYesterday: String(changedSinceYesterday).slice(0, 260),
    jeremyFinishToday: String(jeremyFinishToday).slice(0, 260),
    patrickReviewTonight: String(patrickReviewTonight).slice(0, 260),
    guardrailEcho: GUARD_MSG,
  };
}

function suggestionList(modeRaw) {
  const mode = dashboardViewService.normalizeMode(modeRaw);

  const baseJeremy = [
    "What should Jeremy do next?",
    "Which lanes look like they block cash?",
    "Show open WO or garment drafts waiting on approvals.",
  ];
  const basePatrick = [
    "What needs Patrick approval right now?",
    "What Google Ads should I review tonight?",
    "Find customer Jessica.",
  ];
  const baseAdvisor = [
    "Explain the top blocker wording to Patrick.",
    "What does KPI snapshot imply about approvals backlog?",
    "What outreach drafts mention deposits?",
    "What is the system worried about right now?",
    "What changed since yesterday?",
  ];

  /** @type {string[]} */
  let list = [];
  if (mode === "jeremy") list = baseJeremy.concat(baseAdvisor.slice(2));
  else if (mode === "patrick") list = basePatrick.concat(baseAdvisor);
  else list = baseAdvisor.concat(basePatrick.slice(0, 2)).concat(baseJeremy.slice(0, 2));

  return {
    suggestions: list.slice(0, 14),
    mode,
    guardrailEcho: GUARD_MSG,
  };
}

async function respondAsk(question, mode) {
  return composeAnswer(question, mode);
}

module.exports = {
  composeAnswer,
  searchAcrossSystem,
  suggestionList,
  respondAsk,
  GUARD_MSG,
};
