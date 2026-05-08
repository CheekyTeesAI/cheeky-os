"use strict";

const dashboardDataService = require("../dashboard/dashboardDataService");
const approvalEngine = require("../workflow/approvalEngine");
const graphEmailConnector = require("../connectors/graphEmailConnector");
const { buildProductionBoardPayload } = require("../routes/productionBoard.route");
const operatorQueryRouter = require("./operatorQueryRouter");

function extractPersonHeuristic(q) {
  const s = String(q || "").trim();
  let m;
  if ((m = s.match(/^what did ([A-Za-z][A-Za-z'\-]{1,48})'?s\b/i))) return m[1].trim();
  if ((m = s.match(/\blast (?:email|message) from ([A-Za-z][A-Za-z'\-\s]{1,48})\b/i)))
    return m[1].trim().split(/\s+/).slice(0, 3).join(" ");
  if ((m = s.match(/\bfrom ([A-Za-z][A-Za-z'\-\s]{1,48})\?$/i)))
    return m[1].trim().split(/\s+/).slice(0, 3).join(" ");
  return "";
}

function classifyIntent(low) {
  if (/\bwhat should i focus\b|\bfocus on today\b|\bpriority\b|\bwhat matters\b|\bmorning\b|\boutlook\b/.test(low))
    return "today_focus";
  if (/\bwhat is blocked\b|\bwhat'?s blocked\b|\bblocked orders\b|\bblocked\b|\bstuck\b|\bgated\b|\bcannot move\b/.test(low))
    return "blocks";
  if (/\bwhat needs deposit\b|\bneeds deposit\b|\bdeposit(s)?\s+missing\b|\bwaiting on deposit\b/.test(low)) return "deposit_needs";
  if (/\bwhat needs approval\b|\bneeds approval\b|\bpending approvals?\b|\bapproval queue\b/.test(low))
    return "approvals";
  if (/\bwhat needs art\b|\bneeds art\b|\bart needed\b|\bart missing\b/.test(low)) return "art_needs";
  if (/\bwhat is ready for production\b|\bready for production\b|\bready\s+for\s+the\s+floor\b|\bproduction ready\b/.test(low))
    return "production_ready";
  if (
    /\bjeremy\b|\bwhat is ready to print\b|\bproduction board\b|\bin production\b|\bon press\b|\bqc queue\b|\bprinting\b/.test(low)
  )
    return "production";
  if (/\bcash\b|\binvoice\b|\bpayment\b|\bunpaid\b|\bestimate follow\b|\bfollow-?up\b/.test(low)) {
    if (/art|proof|mockup|digit/i.test(low)) return "art_needs";
    return "cash";
  }
  if (/\bgarment\b|\bwhat garments\b|\bgarments?\s+need\b|\bneed(s)? garments\b|\bblank\b|\bcarolina\b|\border blank\b/.test(low))
    return "garments";
  if (/\bemail\b|\blast message\b|\blast email\b|\bsaid\b|\bwrote\b|\boutlook\b|\bgmail\b/.test(low))
    return "email_last";
  return "general";
}

/**
 * @param {{ query: string, requestedBy?: string, mode?: string }} body
 */
async function handleOperatorCommand(body) {
  const raw = String(body && body.query ? body.query : "").trim();
  const requestedBy = body && body.requestedBy ? String(body.requestedBy).slice(0, 120) : "operator";
  const mode = String(body && body.mode ? body.mode : "read_only").toLowerCase();

  /** @type {{ type: string, label: string }[]} */
  const sources = [];
  /** @type {object[]} */
  let recommendedActions = [];
  /** @type {object[]} */
  let requiredApprovals = [];
  /** @type {object[]} */
  const drafts = [];
  /** @type {{ label: string, href: string }[]} */
  let dashboardLinks = [];

  if (!raw) {
    return {
      success: false,
      error: "query_required",
      answer: "",
      recommendedActions: [],
      requiredApprovals: [],
      sources: [],
      drafts: [],
      approvalsNeeded: [],
      dashboardLinks: [],
      confidence: 0,
    };
  }

  if (
    mode === "read_only" &&
    /\bsend email\b|\border garment\b|\bcharge\b|\brefund\b|\bmutate square\b/i.test(raw)
  ) {
    return {
      success: true,
      answer:
        'That action needs explicit operator mode. Retry with body.mode = "draft" or "approval_required". Cheeky OS will not auto-send, auto-order, or mutate Square.',
      recommendedActions: [{ action: "retry_with_mode_draft", severity: "info" }],
      requiredApprovals,
      sources: [{ type: "policy", label: "read_only_intercept" }],
      drafts,
      approvalsNeeded: requiredApprovals,
      dashboardLinks: [
        { label: "Dashboard", href: "/api/dashboard/main" },
        { label: "Approvals API", href: "/api/operator/approvals" },
      ],
      confidence: 0.92,
    };
  }

  const intent = classifyIntent(raw.toLowerCase());

  const main = await dashboardDataService.buildMainDashboard();
  const blocks = await dashboardDataService.blockedOrdersSummary();
  const cash = await dashboardDataService.buildCashRisks();
  const art = await dashboardDataService.buildArtPipeline();
  const garments = await dashboardDataService.buildGarmentBoard();

  dashboardLinks = [
    { label: "Today's snapshot", href: "/api/operator/today" },
    { label: "Production board (v2)", href: "/api/production-board" },
    { label: "Operator production", href: "/api/operator/production-board" },
    { label: "Cash risks", href: "/api/operator/cash-risks" },
    { label: "Dashboard — main", href: "/api/dashboard/main" },
  ];

  let answer = "";
  let confidence = 0.68;

  if (intent === "deposit_needs") {
    const depDb = cash.risks.filter((r) => r.kind === "deposit_missing_db").length;
    answer = `Deposit attention: ~${cash.unpaidInvoiceApprox} unpaid Square invoices in search window; ${depDb} DB orders invoiced without recorded deposit (heuristic).`;
    confidence = 0.71;
    sources.push({ type: "dashboard", label: "cashRisks+orders" });
    recommendedActions = [
      { action: "square_reconcile", href: "/api/dashboard/cash", reason: "Match payments to invoices" },
      { action: "deposit_cards", hint: "See normalizedSections.cash in GET /api/dashboard/main" },
    ];
  } else if (intent === "art_needs") {
    const nArt = art.missing.length + art.pendingApproval.length;
    answer = `Art workload: ~${art.missing.length} missing/bad-vector cases, ~${art.pendingApproval.length} waiting on approvals, ~${art.digitizing.length} digitizing.`;
    confidence = 0.72;
    sources.push({ type: "dashboard", label: "art_pipeline" });
    recommendedActions.push({ action: "art_board", href: "/api/dashboard/art", reason: `${nArt} cards need designer attention` });
  } else if (intent === "production_ready") {
    const pb = await buildProductionBoardPayload();
    if (!pb.ok) {
      answer = "Production READY queue unavailable — check Prisma / DB.";
      confidence = 0.45;
    } else {
      const n = pb.PRODUCTION_READY && pb.PRODUCTION_READY.length ? pb.PRODUCTION_READY.length : 0;
      answer = `${n} orders are flagged PRODUCTION_READY for the floor (${pb.PRINTING?.length || 0} printing, ${pb.QC?.length || 0} QC).`;
      confidence = 0.76;
      sources.push({ type: "database", label: "productionBoard.PRODUCTION_READY" });
      recommendedActions.push({ action: "floor_pull", href: "/api/production-board", reason: "Jeremy/next operator pulls next PRODUCTION_READY" });
    }
  } else if (intent === "today_focus") {
    answer = `Today's focus: ${main.todaysFocus.title}.`;
    if (blocks.count) answer += ` Blocked jobs in DB: ${blocks.count}.`;
    confidence = 0.74;
    sources.push({ type: "dashboard", label: "dashboardDataService.buildMainDashboard" });
    recommendedActions = [
      { action: "review_blocked", href: "/api/operator/blocks", reason: "Clear explicit blockedReason fields" },
      {
        action: "review_approvals",
        href: "/api/operator/approvals",
        reason: `${main.approvals.count} pending approvals`,
      },
    ];
  } else if (intent === "blocks") {
    answer =
      blocks.count === 0
        ? "No blocked / stuck flags on recent orders (DB heuristic)."
        : `${blocks.count} orders show blockedReason or stuckReason signals. First: ${blocks.orders[0]?.customerName || "unknown"}.`;
    confidence = 0.72;
    sources.push({ type: "database", label: "orders + operatorStuckReasons" });
    recommendedActions = [{ action: "inspect_blocks", href: "/api/operator/blocks" }];
  } else if (intent === "approvals") {
    const pending = approvalEngine.getPendingApprovals().slice(0, 12);
    answer =
      pending.length === 0
        ? "No pending approval rows in approvals.jsonl."
        : `${pending.length} pending approvals — oldest task ${pending[0]?.taskId}.`;
    confidence = 0.78;
    pending.forEach((p) =>
      requiredApprovals.push({
        approvalId: p.approvalId,
        taskId: p.taskId,
        category: p.category,
      })
    );
    sources.push({ type: "ledger", label: "approvalEngine" });
  } else if (intent === "production") {
    const pb = await buildProductionBoardPayload();
    if (!pb.ok) {
      answer = "Production board unavailable — database client missing.";
      confidence = 0.4;
    } else {
      answer = `Production board: ${pb.PRODUCTION_READY?.length || 0} ready · ${pb.PRINTING?.length || 0} printing · ${pb.QC?.length || 0} QC · stuck rows ${pb.STUCK?.length || 0}.`;
      confidence = 0.76;
      sources.push({ type: "database", label: "productionBoard" });
      recommendedActions.push({ action: "open_floor_view", href: "/api/operator/production-board" });
    }
  } else if (intent === "cash") {
    answer = `Cash signals: ~${cash.unpaidInvoiceApprox} unpaid invoices (Square window) + ${cash.risks.length} synthesized risk rows.`;
    confidence = cash.squareConfigured ? 0.72 : 0.52;
    sources.push({ type: cash.squareConfigured ? "square" : "database", label: "squareRead + orders" });
    recommendedActions.push({ action: "review_invoices", hint: "GET /api/dashboard/cash" });
  } else if (intent === "garments") {
    answer = `${garments.needingBlanks?.length || 0} orders need blanks · ${garments.waitingOnGarments?.length || 0} awaiting receipt · Carolina Made primary vendor — drafts only.`;
    confidence = 0.7;
    sources.push({ type: "database", label: "garmentBoard" });
    recommendedActions.push({
      action: "draft_carolina_order",
      href: "/api/garments/create-carolina-made-draft",
      note: "POST — internal draft only",
    });
  } else if (intent === "email_last") {
    const who = extractPersonHeuristic(raw);
    if (!who || !graphEmailConnector.isConfigured()) {
      answer = graphEmailConnector.isConfigured()
        ? "Couldn't infer a person name — try: What did Jessica say in her last email?"
        : "Mailbox intelligence disabled — set MS_GRAPH_* environment variables.";
      confidence = graphEmailConnector.isConfigured() ? 0.45 : 0.55;
      sources.push({ type: "graph", label: graphEmailConnector.isConfigured() ? "ambiguous" : "offline" });
    } else {
      sources.push({ type: "graph", label: "graphEmailConnector.getLastEmailFromContact" });
      try {
        const payload = await graphEmailConnector.getLastEmailFromContact(who);
        if (!payload || payload.ok === false || !payload.email) {
          answer = `No mailbox hit for ${who}${payload && payload.error ? `: ${payload.error}` : ""}.`;
          confidence = 0.55;
        } else {
          const subj = payload.email.subject || "(no subject)";
          answer = `Latest email involving ${who}: "${String(subj).slice(0, 160)}".`;
          confidence = 0.78;
          recommendedActions.push({
            action: "open_mail_thread",
            hint: "Use Graph or /api/intelligence/email/* for full detail",
          });
        }
      } catch (e) {
        answer = `Graph lookup failed: ${e.message || String(e)}`;
        confidence = 0.4;
      }
    }
  } else {
    const legacy = await operatorQueryRouter.routeOperatorQuery({ query: raw, requestedBy });
    answer = legacy.answer || legacy.recommendedNextAction || "No operator answer available.";
    confidence = Number(legacy.confidence) || 0.5;
    sources.push({ type: "router", label: "operatorQueryRouter" });
    if (legacy.sources) legacy.sources.forEach((s) => sources.push(s));
  }

  const pendingAll = approvalEngine.getPendingApprovals().slice(0, 20);
  pendingAll.forEach((p) =>
    drafts.push({
      approvalId: p.approvalId,
      taskId: p.taskId,
      category: p.category,
      hint: "Approve via existing /api/approvals routes",
    })
  );

  return {
    success: true,
    intent,
    answer,
    recommendedActions,
    requiredApprovals,
    sources,
    drafts,
    approvalsNeeded: requiredApprovals.length ? requiredApprovals : pendingAll,
    dashboardLinks,
    confidence,
    meta: { requestedBy, mode },
  };
}

module.exports = {
  handleOperatorCommand,
  classifyIntent,
};
