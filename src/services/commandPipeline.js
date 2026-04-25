/**
 * Unified command pipeline — single brain for POST /command.
 * Flow: parseInput → detectIntent → routeToEngine → formatResponse
 */

const { buildFullProductionReport } = require("./productionEngine");
const { summarizeJobs } = require("./financeEngine");
const { generatePurchaseList } = require("./purchasingEngine");
const { checkInventory } = require("./inventoryEngine");
const { buildPurchasePlan } = require("./purchasingPlanner");
const {
  getPurchasingView,
  summarizePurchasingView,
  slicePlanForView,
} = require("./purchasingIntentHelper");
const { buildShopBoardPayload } = require("./shopBoardService");
const { transitionFoundationJobStatus } = require("./foundationJobService");
const { getSystemStatus } = require("./statusEngine");

const {
  handleCreateInvoice,
  handleAddJob,
  handleQuery,
  buildContext,
} = require("./commandRouter");

function normalize(s) {
  return String(s || "").toLowerCase().trim();
}

function extractPoFromCommand(text) {
  const t = String(text || "");
  const m = t.match(/PO-\d{4,}-\d+/i);
  if (m) return m[0];
  const m2 = t.match(/\bpo[\s#-]*(\d{1,5})\b/i);
  if (m2) {
    const d = new Date();
    const y = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    const n = String(m2[1]).padStart(3, "0");
    return `PO-${y}${mo}${day}-${n}`;
  }
  return "";
}

function extractIntakeId(text) {
  const s = String(text || "");
  const m = s.match(/\bINT-[a-z0-9-]+\b/i);
  if (m) return m[0];
  const m2 = s.match(/\bintake\s+([a-z0-9-]+)\b/i);
  if (m2 && /^INT-/i.test(m2[1])) return m2[1];
  return "";
}

function extractJobIdFromCommand(text) {
  const m = String(text || "").match(/\bJOB-[a-z0-9-]+\b/i);
  return m && m[0] ? m[0] : "";
}

function extractServiceDeskId(text) {
  const m = String(text || "").match(/\b(SD-[A-Za-z0-9-]+)\b/i);
  return m && m[0] ? m[0] : "";
}

function parseInput(body) {
  const b = body && typeof body === "object" ? body : {};
  const text = String(b.input || b.text || b.question || "").trim();
  return {
    raw: b,
    text,
    shopMode: b.shopMode === true || b.mode === "shop",
    confirm: b.confirm === true,
  };
}

/**
 * Intent taxonomy for routing (additive; legacy invoice/job still supported).
 */
function detectIntent(text, parsed) {
  if (parsed.shopMode || text === "__SHOP_BOARD__") return "SHOP_BOARD";
  const q = normalize(text);
  if (!q) return "UNKNOWN";

  if (/run system|full system|system snapshot|cheeky\s*-?\s*ai\s*run|orchestrator run/i.test(q)) {
    return "SYSTEM_RUN";
  }
  if (/system status|health check|^\s*status\s*$/i.test(q)) return "SYSTEM_STATUS";

  if (/^\s*pause\s+system\b|pause\s+cheeky\s*os/i.test(q)) return "SYSTEM_PAUSE_CMD";
  if (/^\s*resume\s+system\b|resume\s+cheeky\s*os/i.test(q)) return "SYSTEM_RESUME_CMD";
  if (/^\s*lock\s+system\b/i.test(q)) return "SYSTEM_LOCK_CMD";
  if (/^\s*unlock\s+system\b/i.test(q)) return "SYSTEM_UNLOCK_CMD";
  if (/who\s+did\s+that|show\s+audit\s+log|audit\s+log\b/i.test(q)) return "AUDIT_QUERY_CMD";

  if (/run\s+startup\s+check/i.test(q)) return "RUN_STARTUP_CHECK";
  if (/show\s+config\s+status|^config\s+status\s*$/i.test(q)) return "SHOW_CONFIG_STATUS";
  if (/create\s+backup/i.test(q)) return "CREATE_BACKUP";
  if (/list\s+backups/i.test(q)) return "LIST_BACKUPS";
  if (/preview\s+restore/i.test(q)) return "PREVIEW_RESTORE_CMD";
  if (/bootstrap\s+system/i.test(q)) return "BOOTSTRAP_SYSTEM";
  if (/what\s+is\s+missing\s+from\s+config|what'?s\s+missing\s+from\s+config/i.test(q)) {
    return "WHAT_MISSING_CONFIG";
  }
  if (/what\s+version\s+are\s+we\s+on|^\s*what\s+version\b/i.test(q)) return "WHAT_VERSION";

  if (/^\s*run\s+setup\b|run\s+initial\s+setup|bootstrap\s+setup/i.test(q)) return "ADOPTION_SETUP_RUN";
  if (/what\s+is\s+left\s+to\s+set\s+up|what'?s\s+left\s+to\s+set\s+up|^\s*setup\s+status\s*$/i.test(q)) {
    return "ADOPTION_SETUP_STATUS";
  }
  if (/seed\s+demo(\s+data)?\b/i.test(q)) return "ADOPTION_DEMO_SEED";
  if (/clear\s+demo(\s+data)?\b/i.test(q)) return "ADOPTION_DEMO_CLEAR";
  if (/show\s+printer\s+guide|printer\s+guide/i.test(q)) return "ADOPTION_GUIDE_PRINTER";
  if (/show\s+admin\s+guide|admin\s+guide/i.test(q)) return "ADOPTION_GUIDE_ADMIN";
  if (/how\s+do\s+i\s+use\s+(the\s+)?control\s+tower|control\s+tower\s+help/i.test(q)) return "ADOPTION_HELP_CT";
  if (/what\s+should\s+jeremy\s+click\s+first|jeremy.*click\s+first/i.test(q)) return "ADOPTION_JEREMY_FIRST";

  if (/show\s+recent\s+emails?/i.test(q)) return "OPS_RECENT_EMAILS";
  if (/what\s+came\s+in\s+today/i.test(q)) return "OPS_WHAT_TODAY";
  if (/show\s+art\s+queue|\bart\s+queue\b/i.test(q)) return "OPS_ART_QUEUE";
  if (/what\s+art\s+is\s+print\s*ready|print[-\s]*ready\s+art/i.test(q)) return "OPS_ART_PRINT_READY";
  if (/show\s+timeline\s+for\s+job\b/i.test(q)) return "OPS_TIMELINE_JOB";
  if (/show\s+customer\s+timeline\s+for\b/i.test(q)) return "OPS_TIMELINE_CUSTOMER";
  if (/did\s+(this\s+)?customer\s+send\s+art/i.test(q)) return "OPS_ART_SENT_CHECK";
  if (/what\s+messages\s+(are\s+)?tied\s+to\s+(this\s+)?job/i.test(q)) return "OPS_JOB_MESSAGES";
  if (/shop\s+phone|what\s+came\s+through\s+.*phone/i.test(q) && /today/i.test(q)) return "OPS_PHONE_TODAY";

  if (/^\s*are\s+we\s+live\??/i.test(q)) return "GOLIVE_STATUS";
  if (/what\s+is\s+blocking\s+go\s*[-\s]?live/i.test(q)) return "GOLIVE_BLOCKERS";
  if (/show\s+go[-\s]?live\s+readiness|go[-\s]?live\s+readiness/i.test(q)) return "GOLIVE_READINESS";
  if (/test\s+providers/i.test(q)) return "GOLIVE_TEST_PROVIDERS";
  if (/preview\s+live\s+cutover/i.test(q)) return "GOLIVE_PREVIEW";
  if (/^\s*go\s+live\b/i.test(q)) return "GOLIVE_EXECUTE";
  if (/what\s+is\s+still\s+in\s+mock/i.test(q)) return "GOLIVE_MOCK";
  if (/what\s+is\s+still\s+manual/i.test(q)) return "GOLIVE_MANUAL";

  if (/what\s+should\s+i\s+post\s+today/i.test(q)) return "CONTENT_TODAY";
  if (/\bgenerate\s+new\s+content\b|\bgenerate\s+content\b/i.test(q)) return "CONTENT_GENERATE";
  if (/^\s*approve\s+post\b|approve\s+today'?s?\s+post/i.test(q)) return "CONTENT_APPROVE";
  if (/^\s*skip\s+post\b/i.test(q)) return "CONTENT_SKIP";
  if (/show\s+content\s+queue|content\s+queue/i.test(q)) return "CONTENT_QUEUE_SHOW";
  if (/mark\s+posted|mark\s+post\s+complete|mark\s+content\s+complete/i.test(q)) return "CONTENT_MARK_POSTED";
  if (/show\s+content\s+ideas|content\s+ideas|content\s+backlog/i.test(q)) return "CONTENT_BACKLOG";

  if (
    /what should i do today|where is money stuck|what is most urgent|what matters most today|what should i focus on|what should i not work on|what to avoid|run executive report|executive snapshot|what am i missing|executive brain/i.test(q)
  ) {
    return "EXECUTIVE";
  }

  if (
    /run\s+customer\s+service\s+automation/i.test(q) ||
    /what\s+customer\s+issues?\s+(need\s+)?owner\s+review/i.test(q) ||
    /show\s+jeremy\s+.*customer[-\s]?service|jeremy\s+customer[-\s]?service\s+tasks/i.test(q) ||
    /what\s+was\s+auto[-\s]?handled/i.test(q) ||
    /what\s+(is\s+)?escalated\b|what'?s\s+escalated\b/i.test(q) ||
    /preview\s+response\s+for\s+service/i.test(q) ||
    /send\s+response\s+for\s+service/i.test(q) ||
    /what\s+customer\s+service\s+is\s+waiting\s+on\s+us|customer\s+service.*waiting\s+on\s+us/i.test(q) ||
    /what\s+customer\s+service\s+is\s+waiting\s+on\s+the\s+customer|customer\s+service.*waiting\s+on\s+the\s+customer/i.test(
      q
    ) ||
    /escalate\s+service\s+item/i.test(q) ||
    /assign\s+service\s+item/i.test(q) ||
    /mark\s+service\s+item.*\bclosed\b/i.test(q) ||
    /force\s+preview\s+only/i.test(q) ||
    /auto[-\s]?handle\s+all\s+missing\s+info/i.test(q)
  ) {
    return "SERVICE_DESK";
  }

  if (/show\s+(printer|admin|owner|design)\s+board/i.test(q)) {
    return "OPERATOR_VIEW";
  }

  if (/^run\s+automation\b/i.test(q)) return "AUTOMATION_RUN";
  if (/is\s+automation\s+running|automation\s+status\b/i.test(q)) return "AUTOMATION_STATUS";
  if (/what\s+did\s+automation\s+do|automation\s+logs|last\s+automation\s+run/i.test(q)) {
    return "AUTOMATION_LOGS";
  }
  if (/pause\s+automation/i.test(q)) return "AUTOMATION_PAUSE";
  if (/resume\s+automation/i.test(q)) return "AUTOMATION_RESUME";

  if (
    /show\s+jeremy'?s?\s+tasks|show\s+patrick'?s?\s+tasks/i.test(q) ||
    /what\s+is\s+in\s+production|what'?s\s+in\s+production/i.test(q) ||
    /what\s+is\s+blocked\b|blocked\s+tasks\b|team\s+blocked/i.test(q) ||
    /what\s+is\s+complete\s+today|what'?s\s+complete\s+today|completed\s+today/i.test(q) ||
    /pause\s+job/i.test(q) ||
    /force\s+.*bullseye|force\s+job.*bullseye/i.test(q) ||
    /mark\s+job.*complete/i.test(q) ||
    /reassign\s+task/i.test(q)
  ) {
    return "TEAM";
  }

  if (
    /what communications are ready|communications are ready/i.test(q) ||
    /what customers need follow-up|customers need follow-up|need follow-up\??$/i.test(q) ||
    /preview missing info emails/i.test(q) ||
    /preview invoice reminders/i.test(q) ||
    /send pickup text for job/i.test(q) ||
    /send deposit reminder for job/i.test(q) ||
    /show communication history for job|communication history for job/i.test(q) ||
    /what messages failed|messages failed/i.test(q) ||
    /what is pending approval|pending approval/i.test(q)
  ) {
    return "COMMUNICATION";
  }

  if (
    /preview\s+purchase\s+orders/i.test(q) ||
    /what\s+purchase\s+orders\s+are\s+ready/i.test(q) ||
    /preview\s+bullseye\s+direct/i.test(q) ||
    /preview\s+po\s+for/i.test(q) ||
    (/preview\s+po\b/i.test(q) && !/approve/i.test(q)) ||
    /send\s+purchase\s+order\s+to\s+supplier/i.test(q) ||
    /^send\s+po\b/i.test(q) ||
    /approve\s+and\s+send\s+po/i.test(q)
  ) {
    return "VENDOR_OUTBOUND";
  }

  if (
    /show\s+new\s+inquiries|new\s+inquiries\s+from\s+today|recent\s+inquiries/i.test(q) ||
    /show\s+new\s+orders\s+from\s+today|new\s+orders\s+from\s+today/i.test(q) ||
    /what\s+intake\s+records\s+need\s+info|intake\s+records\s+need\s+info|intake.*need\s+info/i.test(q) ||
    /what\s+is\s+ready\s+for\s+quote|ready\s+for\s+quote/i.test(q) ||
    /show\s+review-required\s+inquiries|review\s*required.*inquiries/i.test(q) ||
    /^convert\s+intake\s+/i.test(q) ||
    /did\s+that\s+email\s+include\s+art|include\s+art/i.test(q) ||
    (/intake/i.test(q) && /ready\s+for\s+job/i.test(q))
  ) {
    return "INTAKE";
  }

  if (
    /sync\s+square|square\s+sync/i.test(q) ||
    /unpaid\s+invoices|invoices\s+are\s+unpaid|what\s+invoices\s+are\s+unpaid/i.test(q) ||
    /open\s+estimates|estimates\s+are\s+open|what\s+estimates/i.test(q) ||
    /blocked\s+by\s+payment|jobs\s+blocked.*payment|which\s+jobs\s+are\s+blocked/i.test(q) ||
    /preview\s+quote.*intake|create\s+draft\s+quote/i.test(q) ||
    /preview\s+invoice|create\s+draft\s+invoice/i.test(q) ||
    /square\s+reconciliation|reconciliation\s+issues/i.test(q)
  ) {
    return "SQUARE";
  }

  if (
    /plan\s+this\s+week|plan\s+the\s+week|week\s+plan|schedule\s+this\s+week|production\s+plan/i.test(q) ||
    /what\s+do\s+we\s+run\s+today|what\s+to\s+run\s+today|run\s+today/i.test(q) ||
    /blocked\s+jobs|blocked\s+this\s+week/i.test(q) ||
    /outsourc|what\s+should\s+be\s+outsourced|vendor\s+now/i.test(q) ||
    /what\s+should\s+wait|should\s+wait|defer\s+behind|low\s+priority.*wait/i.test(q) ||
    /high\s+profit|profit.*first|go\s+first|margin.*jobs/i.test(q)
  ) {
    return "SCHEDULE";
  }

  if (
    /send\s+work\s+order|work\s+order\s+to\s+bullseye|email\s+.*work\s+order|bullseye\s+work\s+order/i.test(q) ||
    /^\s*send\s+\d{1,5}\s+(tee|tees|shirt|shirts|hoodie|hoodies|polo|polos)\b/i.test(q) ||
    /\bsend\s+\d{1,5}\s+.*\b(tee|tees|shirt|shirts)\b/i.test(q)
  ) {
    return "WORK_ORDER";
  }

  if (/(^|\s)(create|send|issue|make)\s+(an?\s+)?invoice|invoice for/i.test(q)) {
    return "FINANCE_INVOICE";
  }
  if (/(^|\s)(create|add|new)\s+(a\s+)?job|add job/i.test(q)) return "JOB_CREATE";
  if (/update\s+job|change\s+status|set\s+status|job\s+status/i.test(q)) return "JOB_UPDATE";

  if (
    /purchase|order blanks|what should we order|purchasing|buy blanks|materials to order/i.test(q) ||
    /what\s+do\s+we\s+need\s+to\s+order|need\s+to\s+order|blanks?\s+missing|show\s+shortages|build\s+purchase|which\s+jobs\s+are\s+blocked\s+by\s+garments?|fulfill\s+from\s+stock|what\s+can\s+we\s+fulfill/i.test(q)
  ) {
    return "PURCHASING";
  }
  if (/route|routing|bullseye|outsource|vendor decision|where should.*print/i.test(q)) {
    return "ROUTING";
  }
  if (/profit|revenue|margin|financial|how much money|total profit|total cost|p&l/i.test(q)) {
    return "FINANCE";
  }
  if (/production queue|what should we print first|print queue|ready to print|batches today|in production/i.test(q)) {
    return "PRODUCTION";
  }

  return "QUERY";
}

function formatResponse({ type, summary, data, nextActions, mock, intent }) {
  const t =
    type === "action"
      ? "action"
      : type === "error"
        ? "error"
        : type === "content"
          ? "content"
          : "query";
  return {
    type: t,
    summary: String(summary || ""),
    data: data && typeof data === "object" ? data : {},
    nextActions: Array.isArray(nextActions) ? nextActions : [],
    mock: Boolean(mock),
    intent: intent || null,
  };
}

function actionsToNext(actions) {
  const list = Array.isArray(actions) ? actions : [];
  return list.slice(0, 6).map((a) => {
    if (a && typeof a === "object") return a.label || a.type || a.title || JSON.stringify(a).slice(0, 80);
    return String(a);
  });
}

async function routeIntent(intent, parsed) {
  const input = parsed.text;
  const body = parsed.raw;

  if (intent === "SYSTEM_RUN") {
    const cheeki = require("../routes/cheekiAi");
    if (typeof cheeki.buildOperationsSnapshot !== "function") {
      return formatResponse({
        type: "action",
        summary: "System snapshot unavailable.",
        data: { error: "buildOperationsSnapshot missing" },
        nextActions: [],
        mock: true,
        intent: "SYSTEM_RUN",
      });
    }
    const snap = await cheeki.buildOperationsSnapshot();
    const ui = {
      success: true,
      mock: snap.mock,
      note: snap.note,
      systemStatus: snap.systemStatus,
      jobs: snap.jobs,
      queue: snap.queue,
      batches: snap.batches,
      tasks: snap.tasks,
      routing: snap.routing,
      vendors: snap.vendors,
      production: snap.production,
      purchasing: snap.purchasing,
      financials: snap.financials,
      plan: snap.plan,
      schedule: snap.schedule,
      gaps: snap.gaps,
      selfHeal: snap.selfHeal,
      dataIntegrity: snap.dataIntegrity,
      dataSources: snap.dataSources,
    };
    return formatResponse({
      type: "action",
      summary: snap.note || "System snapshot loaded.",
      data: ui,
      nextActions: ["Review gaps & self-heal", "Run a production query"],
      mock: snap.mock,
      intent: "SYSTEM_RUN",
    });
  }

  if (intent === "SYSTEM_STATUS") {
    const status = getSystemStatus();
    return formatResponse({
      type: "query",
      summary: `Health: ${status.health || "UNKNOWN"} (mockMode: ${Boolean(status.mockMode)})`,
      data: { status },
      nextActions: ["run system"],
      mock: Boolean(status.mockMode),
      intent: "SYSTEM_STATUS",
    });
  }

  if (/^ADOPTION_/.test(String(intent || ""))) {
    const { getFirstRunStatus } = require("./firstRunService");
    const { runInitialSetup, buildSetupChecklist } = require("./setupWizardService");
    const { seedDemoData, clearDemoData } = require("./demoDataService");
    const { getWorkflowGuides } = require("./guidedWorkflowService");
    const { getHelpContent } = require("./helpContentService");
    const { logAdoptionEvent } = require("./adoptionEventLog");

    if (intent === "ADOPTION_SETUP_RUN") {
      const mode = String((body && body.mode) || "SAFE").toUpperCase();
      const out = await runInitialSetup({ mode });
      logAdoptionEvent("setup_run_command", { mode });
      return formatResponse({
        type: "action",
        summary: out.ok ? "Initial setup completed (idempotent steps)." : "Setup run finished with issues.",
        data: { action: "ADOPTION", result: out },
        nextActions: ["GET /setup/checklist", "GET /setup/status"],
        mock: false,
        intent,
      });
    }
    if (intent === "ADOPTION_SETUP_STATUS") {
      const fr = await getFirstRunStatus();
      const cl = buildSetupChecklist();
      logAdoptionEvent("setup_status_command", {});
      return formatResponse({
        type: "query",
        summary: fr.isFirstRun ? "First-run / setup items may still apply." : "Core setup looks present — verify checklist.",
        data: { action: "ADOPTION", firstRun: fr, checklist: cl },
        nextActions: ["Run setup", "GET /setup/checklist"],
        mock: false,
        intent,
      });
    }
    if (intent === "ADOPTION_DEMO_SEED") {
      const confirm = body && body.confirm === true;
      const out = await seedDemoData({ confirm });
      return formatResponse({
        type: out.ok ? "action" : "error",
        summary: out.message || out.error || (out.ok ? "Demo data seeded." : "Demo seed failed."),
        data: { action: "ADOPTION", result: out },
        nextActions: confirm ? [] : ['Add "confirm": true to the JSON body to seed.'],
        mock: false,
        intent,
      });
    }
    if (intent === "ADOPTION_DEMO_CLEAR") {
      const confirm = body && body.confirm === true;
      const out = await clearDemoData({ confirm });
      return formatResponse({
        type: out.ok ? "action" : "error",
        summary: out.ok ? "Demo data cleared where marked isDemo." : (out.message || out.error || "Demo clear failed."),
        data: { action: "ADOPTION", result: out },
        nextActions: confirm ? [] : ['Add "confirm": true to clear demo rows.'],
        mock: false,
        intent,
      });
    }
    if (intent === "ADOPTION_GUIDE_PRINTER") {
      const g = getWorkflowGuides("PRINTER");
      logAdoptionEvent("guide_viewed", { role: "PRINTER", via: "command" });
      return formatResponse({
        type: "query",
        summary: "Printer quick guide",
        data: { action: "ADOPTION", result: g },
        nextActions: ["Open /shop/board"],
        mock: false,
        intent,
      });
    }
    if (intent === "ADOPTION_GUIDE_ADMIN") {
      const g = getWorkflowGuides("ADMIN");
      logAdoptionEvent("guide_viewed", { role: "ADMIN", via: "command" });
      return formatResponse({
        type: "query",
        summary: "Admin quick guide",
        data: { action: "ADOPTION", result: g },
        nextActions: ["Open /service-desk"],
        mock: false,
        intent,
      });
    }
    if (intent === "ADOPTION_HELP_CT") {
      const h = getHelpContent("control-tower");
      return formatResponse({
        type: "query",
        summary: h.title,
        data: { action: "ADOPTION", result: h },
        nextActions: ["GET /control-tower"],
        mock: false,
        intent,
      });
    }
    if (intent === "ADOPTION_JEREMY_FIRST") {
      const printer = getWorkflowGuides("PRINTER");
      const owner = getWorkflowGuides("OWNER");
      return formatResponse({
        type: "query",
        summary: "Start on the printer board, then use tasks to move the top READY job.",
        data: {
          action: "ADOPTION",
          jeremy: { focus: "Printer board → start next READY task → complete or block with a reason." },
          printerGuide: printer,
          ownerContext: owner.guide && owner.guide[0],
        },
        nextActions: ["GET /shop/board", "Show printer guide"],
        mock: false,
        intent,
      });
    }
  }

  if (/^OPS_/.test(String(intent || ""))) {
    const { listRecentEmailsSince } = require("./emailInboxService");
    const { getArtReviewQueue, getPrintReadyArt } = require("./artQueueService");
    const { getAggregatedForJob, getAggregatedForCustomer, getRecentTimeline } = require("./timelineService");
    const { listSmsSince, listCallsSince } = require("./phoneOpsService");
    const { getCommunicationsByRelated } = require("./communicationService");
    const { findCustomerMatch } = require("./customerMatchService");
    const { getArtQueue } = require("./artOpsService");

    const dayStart = `${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`;

    if (intent === "OPS_RECENT_EMAILS") {
      const emails = listRecentEmailsSince().slice(-25);
      return formatResponse({
        type: "query",
        summary: `${emails.length} recent inbound email(s) on file.`,
        data: { action: "OPS_INBOUND", emails },
        nextActions: ["GET /timeline/recent"],
        mock: false,
        intent,
      });
    }
    if (intent === "OPS_WHAT_TODAY") {
      const emails = listRecentEmailsSince(dayStart);
      const sms = listSmsSince(dayStart);
      const calls = listCallsSince(dayStart);
      const recent = getRecentTimeline({ since: dayStart, limit: 40 });
      return formatResponse({
        type: "query",
        summary: `Today: ${emails.length} email(s), ${sms.length} SMS, ${calls.length} call(s).`,
        data: { action: "OPS_INBOUND", emails, sms, calls, timeline: recent },
        nextActions: [],
        mock: false,
        intent,
      });
    }
    if (intent === "OPS_ART_QUEUE") {
      const queue = getArtReviewQueue();
      return formatResponse({
        type: "query",
        summary: `${queue.length} art file(s) in review / uploaded.`,
        data: { action: "OPS_ART", queue },
        nextActions: ["GET /art/queue"],
        mock: false,
        intent,
      });
    }
    if (intent === "OPS_ART_PRINT_READY") {
      const queue = getPrintReadyArt();
      return formatResponse({
        type: "query",
        summary: `${queue.length} print-ready art file(s).`,
        data: { action: "OPS_ART", printReady: queue },
        nextActions: ["GET /art/print-ready"],
        mock: false,
        intent,
      });
    }
    if (intent === "OPS_TIMELINE_JOB") {
      const jobId = extractJobIdFromCommand(input) || String(body.jobId || "").trim();
      if (!jobId) {
        return formatResponse({
          type: "query",
          summary: "Include a JOB-… id in the message.",
          data: { action: "OPS_TIMELINE", hint: "Example: Show timeline for job JOB-ABC-123" },
          nextActions: [],
          mock: false,
          intent,
        });
      }
      const events = getAggregatedForJob(jobId);
      return formatResponse({
        type: "query",
        summary: `Timeline for ${jobId}: ${events.length} event(s).`,
        data: { action: "OPS_TIMELINE", jobId, events },
        nextActions: [`GET /timeline/job/${jobId}`],
        mock: false,
        intent,
      });
    }
    if (intent === "OPS_TIMELINE_CUSTOMER") {
      const m = String(input || "").match(/customer\s+timeline\s+for\s+(.+)/i);
      const name = m ? m[1].trim().replace(/[?.]$/i, "").trim() : "";
      const cm = findCustomerMatch({ name, email: body.customerEmail, phone: body.customerPhone });
      if (!cm.customer) {
        return formatResponse({
          type: "query",
          summary: "Customer not found — try a clearer name or link CUS-… id in body.customerId.",
          data: { action: "OPS_TIMELINE", match: cm },
          nextActions: [],
          mock: false,
          intent,
        });
      }
      const events = getAggregatedForCustomer(cm.customer.id);
      return formatResponse({
        type: "query",
        summary: `Timeline for ${cm.customer.name}: ${events.length} event(s).`,
        data: { action: "OPS_TIMELINE", customerId: cm.customer.id, events },
        nextActions: [`GET /timeline/customer/${cm.customer.id}`],
        mock: false,
        intent,
      });
    }
    if (intent === "OPS_ART_SENT_CHECK") {
      const name = String(body.customerName || "").trim();
      const cm = findCustomerMatch({
        name,
        email: body.customerEmail,
        phone: body.customerPhone,
      });
      const all = getArtQueue().slice(0, 20);
      return formatResponse({
        type: "query",
        summary:
          "Art files are stored per JOB/INTAKE — check queue and linked jobs for this customer.",
        data: {
          action: "OPS_ART",
          customer: cm.customer,
          recentArtFiles: all,
          note: "Pass customerName / customerEmail in JSON body for tighter matching next.",
        },
        nextActions: ["GET /art/queue"],
        mock: false,
        intent,
      });
    }
    if (intent === "OPS_JOB_MESSAGES") {
      const jobId = extractJobIdFromCommand(input) || String(body.jobId || "").trim();
      if (!jobId) {
        return formatResponse({
          type: "query",
          summary: "Include JOB-… in the message or body.jobId.",
          data: { action: "OPS_COMMS" },
          nextActions: [],
          mock: false,
          intent,
        });
      }
      const comms = getCommunicationsByRelated("JOB", jobId);
      return formatResponse({
        type: "query",
        summary: `${comms.length} communication record(s) for ${jobId}.`,
        data: { action: "OPS_COMMS", jobId, communications: comms },
        nextActions: [],
        mock: false,
        intent,
      });
    }
    if (intent === "OPS_PHONE_TODAY") {
      const sms = listSmsSince(dayStart);
      const calls = listCallsSince(dayStart);
      return formatResponse({
        type: "query",
        summary: `Phone channel today: ${sms.length} SMS, ${calls.length} call(s) logged.`,
        data: { action: "OPS_PHONE", sms, calls, degraded: true },
        nextActions: [],
        mock: false,
        intent,
      });
    }
  }

  if (/^GOLIVE_/.test(String(intent || ""))) {
    const { getGlobalOperationalMode, getSystemModes } = require("./systemModeService");
    const { getOperationalContextAsync } = require("./operationalContext");
    const { buildGoLiveReadinessReport } = require("./goLiveReadinessService");
    const { runAllProviderTests } = require("./providerConnectivityService");
    const { previewCutover, executeCutover } = require("./cutoverService");
    const { getLiveOpsSummary } = require("./liveOpsSummaryService");

    if (intent === "GOLIVE_STATUS") {
      const ctx = await getOperationalContextAsync();
      const gm = getGlobalOperationalMode();
      return formatResponse({
        type: "query",
        summary: `Global mode ${gm}. mock=${ctx.mock} degraded=${ctx.degraded}`,
        data: { action: "GOLIVE", globalMode: gm, operationalContext: ctx, modes: getSystemModes() },
        nextActions: ["Show go-live readiness"],
        mock: Boolean(ctx.mock),
        intent,
      });
    }
    if (intent === "GOLIVE_BLOCKERS") {
      const r = await buildGoLiveReadinessReport(null);
      return formatResponse({
        type: "query",
        summary: (r.blockers || []).length ? (r.blockers || []).join("; ") : "No critical blockers listed.",
        data: { action: "GOLIVE", blockers: r.blockers || [], warnings: r.warnings || [] },
        nextActions: ["Show go-live readiness"],
        mock: false,
        intent,
      });
    }
    if (intent === "GOLIVE_READINESS") {
      const r = await buildGoLiveReadinessReport(null);
      return formatResponse({
        type: "query",
        summary: r.ready ? `Readiness score ${r.score}` : `Not ready — ${(r.blockers || []).length} blocker(s).`,
        data: { action: "GOLIVE", report: r },
        nextActions: ["Test providers", "Preview live cutover"],
        mock: false,
        intent,
      });
    }
    if (intent === "GOLIVE_TEST_PROVIDERS") {
      const tests = await runAllProviderTests();
      return formatResponse({
        type: "query",
        summary: "Provider connectivity snapshot (safe tests only).",
        data: { action: "GOLIVE", tests },
        nextActions: [],
        mock: false,
        intent,
      });
    }
    if (intent === "GOLIVE_PREVIEW") {
      const out = await previewCutover("LIVE", null);
      return formatResponse({
        type: "query",
        summary: out.success ? "Preview: cutover allowed if you execute." : "Preview: blocked.",
        data: { action: "GOLIVE", preview: out },
        nextActions: out.success ? ['POST /go-live/cutover with {"targetMode":"LIVE","confirm":true}'] : [],
        mock: false,
        intent,
      });
    }
    if (intent === "GOLIVE_EXECUTE") {
      if (body && body.confirm !== true) {
        return formatResponse({
          type: "query",
          summary: 'Add "confirm": true to the JSON body to execute LIVE cutover.',
          data: { action: "GOLIVE", requiresConfirm: true },
          nextActions: [],
          mock: false,
          intent,
        });
      }
      const out = await executeCutover("LIVE", null);
      return formatResponse({
        type: out.success ? "action" : "error",
        summary: out.success ? "Cutover executed." : `Blocked: ${(out.blocked || []).join("; ")}`,
        data: { action: "GOLIVE", cutover: out },
        nextActions: [],
        mock: false,
        intent,
      });
    }
    if (intent === "GOLIVE_MOCK") {
      const r = await buildGoLiveReadinessReport(null);
      const mocky = (r.subsystemReadiness || []).filter((s) => s && /MOCK|DEGRADED/i.test(String(s.mode)));
      return formatResponse({
        type: "query",
        summary: `${mocky.length} subsystem(s) not fully live.`,
        data: { action: "GOLIVE", degradedSubsystems: mocky },
        nextActions: [],
        mock: false,
        intent,
      });
    }
    if (intent === "GOLIVE_MANUAL") {
      const s = await getLiveOpsSummary(null);
      return formatResponse({
        type: "query",
        summary: "Manual fallbacks and attention items.",
        data: { action: "GOLIVE", summary: s },
        nextActions: [],
        mock: false,
        intent,
      });
    }
  }

  if (
    intent === "SYSTEM_PAUSE_CMD" ||
    intent === "SYSTEM_RESUME_CMD" ||
    intent === "SYSTEM_LOCK_CMD" ||
    intent === "SYSTEM_UNLOCK_CMD" ||
    intent === "AUDIT_QUERY_CMD"
  ) {
    const { getUserFromCommandContext } = require("./authService");
    const { ACTIONS } = require("./permissionService");
    const { appendAudit, getRecentAudit, searchAuditByAction } = require("./auditLogService");
    const ctrl = require("./systemControlService");
    const { enforceCommandAction } = require("./securityEnforcement");

    const user = getUserFromCommandContext(body);
    let actionKey = ACTIONS.SYSTEM_PAUSE;
    if (intent === "SYSTEM_RESUME_CMD") actionKey = ACTIONS.SYSTEM_RESUME;
    else if (intent === "SYSTEM_LOCK_CMD") actionKey = ACTIONS.SYSTEM_LOCK;
    else if (intent === "SYSTEM_UNLOCK_CMD") actionKey = ACTIONS.SYSTEM_UNLOCK;
    else if (intent === "AUDIT_QUERY_CMD") actionKey = ACTIONS.AUDIT_READ;

    const gate = enforceCommandAction(user, body, actionKey);
    if (!gate.ok && gate.code === "unauthorized") {
      return formatResponse({
        type: "error",
        summary: "Unauthorized — include userId and role in the JSON body when CHEEKY_SECURITY_ENABLED=true.",
        data: { action: "SYSTEM_CONTROL", error: "unauthorized" },
        nextActions: [],
        mock: true,
        intent,
      });
    }
    if (!gate.ok && gate.code === "forbidden") {
      return formatResponse({
        type: "error",
        summary: `Forbidden: ${gate.reason || "policy"}`,
        data: { action: "SYSTEM_CONTROL", error: "forbidden", role: user && user.role },
        nextActions: [],
        mock: false,
        intent,
      });
    }
    if (!gate.ok && gate.requiresApproval) {
      return formatResponse({
        type: "query",
        summary: "Owner approval required for this control action.",
        data: {
          action: "SYSTEM_CONTROL",
          requiresApproval: true,
          actionPreview: { action: actionKey, hint: "Provide approvalId from an APPROVED workflow, or run as OWNER." },
        },
        nextActions: [],
        mock: false,
        intent,
      });
    }

    try {
      if (intent === "AUDIT_QUERY_CMD") {
        const frag = String(body.auditAction || body.actionFragment || "").trim();
        const entries = frag ? searchAuditByAction(frag) : getRecentAudit(30);
        appendAudit({
          userId: user && user.userId,
          action: "AUDIT_READ",
          endpoint: "POST /command",
          result: "query",
          payload: { fragment: frag || null },
        });
        return formatResponse({
          type: "query",
          summary: frag ? `Audit entries matching “${frag}”` : "Recent audit entries",
          data: { action: "AUDIT", entries },
          nextActions: [],
          mock: false,
          intent,
        });
      }

      let st;
      if (intent === "SYSTEM_PAUSE_CMD") {
        st = ctrl.pauseSystem({ userId: user && user.userId });
        appendAudit({ userId: user && user.userId, action: ACTIONS.SYSTEM_PAUSE, endpoint: "POST /command", result: "ok" });
      } else if (intent === "SYSTEM_RESUME_CMD") {
        st = ctrl.resumeSystem({ userId: user && user.userId });
        appendAudit({ userId: user && user.userId, action: ACTIONS.SYSTEM_RESUME, endpoint: "POST /command", result: "ok" });
      } else if (intent === "SYSTEM_LOCK_CMD") {
        st = ctrl.lockSystem({ userId: user && user.userId });
        appendAudit({ userId: user && user.userId, action: ACTIONS.SYSTEM_LOCK, endpoint: "POST /command", result: "ok" });
      } else {
        st = ctrl.unlockSystem({ userId: user && user.userId });
        appendAudit({ userId: user && user.userId, action: ACTIONS.SYSTEM_UNLOCK, endpoint: "POST /command", result: "ok" });
      }

      return formatResponse({
        type: "action",
        summary:
          intent === "SYSTEM_LOCK_CMD"
            ? "System locked (paused + automation stopped)."
            : intent === "SYSTEM_UNLOCK_CMD"
              ? "System unlocked and resumed."
              : intent === "SYSTEM_PAUSE_CMD"
                ? "System paused."
                : "System resumed.",
        data: { action: "SYSTEM_CONTROL", control: st },
        nextActions: ["GET /system/state"],
        mock: false,
        intent,
      });
    } catch (e) {
      return formatResponse({
        type: "error",
        summary: e && e.message ? e.message : "system_control_failed",
        data: { action: "SYSTEM_CONTROL", error: e && e.message ? e.message : "error" },
        nextActions: [],
        mock: true,
        intent,
      });
    }
  }

  if (
    intent === "RUN_STARTUP_CHECK" ||
    intent === "SHOW_CONFIG_STATUS" ||
    intent === "CREATE_BACKUP" ||
    intent === "LIST_BACKUPS" ||
    intent === "PREVIEW_RESTORE_CMD" ||
    intent === "BOOTSTRAP_SYSTEM" ||
    intent === "WHAT_MISSING_CONFIG" ||
    intent === "WHAT_VERSION"
  ) {
    const { runStartupValidation } = require("./startupValidationService");
    const { getConfigStatus } = require("./configStatusService");
    const { getBuildInfo } = require("./buildInfoService");
    const { buildSystemBackup, listBackups } = require("./backupService");
    const { previewRestore } = require("./restoreService");
    const { bootstrapSystem } = require("./bootstrapService");
    const { logOpsEvent } = require("./opsEventLog");

    try {
      if (intent === "RUN_STARTUP_CHECK") {
        const sv = await runStartupValidation(null);
        await logOpsEvent("COMMAND_STARTUP_CHECK", String(sv.ok));
        return formatResponse({
          type: "query",
          summary: sv.ok
            ? "Startup check complete (review warnings for degraded subsystems)."
            : "Startup check reported critical issues.",
          data: { action: "DEPLOY", startup: sv },
          nextActions: ["GET /system/startup-check"],
          mock: !sv.ok,
          intent,
        });
      }
      if (intent === "SHOW_CONFIG_STATUS" || intent === "WHAT_MISSING_CONFIG") {
        const cfg = getConfigStatus();
        const missingFlat = [];
        for (const k of Object.keys(cfg)) {
          const block = cfg[k];
          if (block && Array.isArray(block.missing) && block.missing.length) {
            missingFlat.push(`${k}: ${block.missing.join(", ")}`);
          }
        }
        return formatResponse({
          type: "query",
          summary:
            intent === "WHAT_MISSING_CONFIG"
              ? missingFlat.length
                ? `Missing env keys — ${missingFlat.slice(0, 6).join(" · ")}`
                : "No missing keys in tracked subsystems."
              : "Config readiness by subsystem.",
          data: { action: "DEPLOY", config: cfg, missingSummary: missingFlat },
          nextActions: ["GET /system/config"],
          mock: false,
          intent,
        });
      }
      if (intent === "CREATE_BACKUP") {
        const out = buildSystemBackup();
        await logOpsEvent("COMMAND_BACKUP", out.backupId || "");
        return formatResponse({
          type: "action",
          summary: `Backup written: ${out.backupId}`,
          data: { action: "DEPLOY", backup: out },
          nextActions: ["GET /system/backup"],
          mock: false,
          intent,
        });
      }
      if (intent === "LIST_BACKUPS") {
        const backups = listBackups();
        return formatResponse({
          type: "query",
          summary: `${backups.length} backup file(s) in /backups`,
          data: { action: "DEPLOY", backups },
          nextActions: ["GET /system/backup"],
          mock: false,
          intent,
        });
      }
      if (intent === "PREVIEW_RESTORE_CMD") {
        const fp = String(body.restoreFilePath || body.filePath || body.backupPath || "").trim();
        if (!fp) {
          return formatResponse({
            type: "error",
            summary: "Provide restoreFilePath in JSON body (under /backups/…).",
            data: { action: "DEPLOY", error: "filePath_required" },
            nextActions: [],
            mock: true,
            intent,
          });
        }
        const pr = previewRestore(fp);
        await logOpsEvent("COMMAND_RESTORE_PREVIEW", fp);
        return formatResponse({
          type: "query",
          summary: pr.success ? "Restore preview ready." : "Restore preview failed validation.",
          data: { action: "DEPLOY", preview: pr },
          nextActions: ["POST /system/restore/preview"],
          mock: !pr.success,
          intent,
        });
      }
      if (intent === "BOOTSTRAP_SYSTEM") {
        const out = bootstrapSystem();
        await logOpsEvent("COMMAND_BOOTSTRAP", `created=${out.created.length}`);
        return formatResponse({
          type: "action",
          summary: `Bootstrap complete — created ${out.created.length}, skipped ${out.skipped.length}.`,
          data: { action: "DEPLOY", bootstrap: out },
          nextActions: ["POST /system/bootstrap"],
          mock: false,
          intent,
        });
      }
      if (intent === "WHAT_VERSION") {
        const bi = getBuildInfo();
        return formatResponse({
          type: "query",
          summary: `${bi.appName} v${bi.version} (${bi.environment})`,
          data: { action: "DEPLOY", build: bi },
          nextActions: ["GET /system/build-info"],
          mock: false,
          intent,
        });
      }
    } catch (e) {
      return formatResponse({
        type: "error",
        summary: e && e.message ? e.message : "deploy_command_failed",
        data: { action: "DEPLOY", error: e && e.message ? e.message : "error" },
        nextActions: [],
        mock: true,
        intent,
      });
    }
  }

  if (
    intent === "CONTENT_TODAY" ||
    intent === "CONTENT_GENERATE" ||
    intent === "CONTENT_APPROVE" ||
    intent === "CONTENT_SKIP" ||
    intent === "CONTENT_QUEUE_SHOW" ||
    intent === "CONTENT_MARK_POSTED" ||
    intent === "CONTENT_BACKLOG"
  ) {
    const { getOrGenerateTodayPost, forceGenerateTodayPost } = require("./contentScheduler");
    const { checkReminder } = require("./contentReminderService");
    const { getTodayPost, getUnusedPosts, markPosted, skipPost } = require("./contentStore");
    const { approvePost } = require("./contentApprovalService");
    const { getQueue } = require("./contentQueueService");

    try {
      if (intent === "CONTENT_TODAY") {
        const { post, record } = getOrGenerateTodayPost();
        const reminder = checkReminder();
        return formatResponse({
          type: "content",
          summary: "Today's social post",
          data: {
            action: "CONTENT",
            idea: post.idea,
            caption: post.caption,
            shotList: post.shotList,
            post,
            postId: record && record.id,
            status: record && record.status,
            reminder,
          },
          nextActions: ["Approve post", "Mark posted", "GET /content/today"],
          mock: false,
          intent,
        });
      }
      if (intent === "CONTENT_GENERATE") {
        const { post, record } = forceGenerateTodayPost();
        return formatResponse({
          type: "content",
          summary: "Generated new content for today",
          data: {
            action: "CONTENT",
            idea: post.idea,
            caption: post.caption,
            shotList: post.shotList,
            post,
            postId: record && record.id,
            status: record && record.status,
          },
          nextActions: ["POST /content/generate"],
          mock: false,
          intent,
        });
      }
      if (intent === "CONTENT_APPROVE") {
        let id = String(body.postId || "").trim();
        if (!id) {
          const row = getTodayPost();
          id = row && row.id ? String(row.id) : "";
        }
        if (!id) {
          return formatResponse({
            type: "error",
            summary: "No post to approve.",
            data: { action: "CONTENT", error: "no_post" },
            nextActions: [],
            mock: true,
            intent,
          });
        }
        const out = approvePost(id);
        return formatResponse({
          type: "action",
          summary: out.ok ? "Post approved — you can queue or publish manually." : "Approve failed.",
          data: { action: "CONTENT", ...out },
          nextActions: ["POST /content/queue"],
          mock: !out.ok,
          intent,
        });
      }
      if (intent === "CONTENT_SKIP") {
        let id = String(body.postId || "").trim();
        if (!id) {
          const row = getTodayPost();
          id = row && row.id ? String(row.id) : "";
        }
        if (!id) {
          return formatResponse({
            type: "error",
            summary: "No post to skip.",
            data: { action: "CONTENT", error: "no_post" },
            nextActions: [],
            mock: true,
            intent,
          });
        }
        skipPost(id);
        return formatResponse({
          type: "action",
          summary: "Skipped today’s suggested post.",
          data: { action: "CONTENT", postId: id, status: "SKIPPED" },
          nextActions: [],
          mock: false,
          intent,
        });
      }
      if (intent === "CONTENT_QUEUE_SHOW") {
        const q = getQueue();
        return formatResponse({
          type: "query",
          summary: `${q.length} post(s) in queue`,
          data: { action: "CONTENT", queue: q },
          nextActions: ["GET /content/queue"],
          mock: false,
          intent,
        });
      }
      if (intent === "CONTENT_MARK_POSTED") {
        let id = String(body.postId || "").trim();
        if (!id) {
          const row = getTodayPost();
          id = row && row.id ? String(row.id) : "";
        }
        if (!id) {
          return formatResponse({
            type: "error",
            summary: "No post found to mark posted.",
            data: { action: "CONTENT", error: "no_post" },
            nextActions: [],
            mock: true,
            intent,
          });
        }
        markPosted(id);
        return formatResponse({
          type: "action",
          summary: "Marked as posted. Streak +1 energy.",
          data: { action: "CONTENT", postId: id, status: "POSTED" },
          nextActions: [],
          mock: false,
          intent,
        });
      }
      if (intent === "CONTENT_BACKLOG") {
        const list = getUnusedPosts().slice(-15);
        return formatResponse({
          type: "query",
          summary: `${list.length} draft / edit-request backlog item(s)`,
          data: {
            action: "CONTENT",
            backlog: list,
          },
          nextActions: ["GET /content/backlog"],
          mock: false,
          intent,
        });
      }
    } catch (e) {
      return formatResponse({
        type: "error",
        summary: e && e.message ? e.message : "content_command_failed",
        data: { action: "CONTENT", error: e && e.message ? e.message : "error" },
        nextActions: [],
        mock: true,
        intent,
      });
    }
  }

  if (intent === "EXECUTIVE") {
    const { buildExecutiveSnapshot } = require("./executiveSnapshotService");
    try {
      const snap = await buildExecutiveSnapshot();
      return formatResponse({
        type: "query",
        summary: snap.summary,
        data: {
          action: "EXECUTIVE",
          executive: snap,
          result: { intent: "EXECUTIVE", ...snap },
        },
        nextActions: (snap.actions || []).slice(0, 3).map((a) => a.nextCommand || a.title),
        mock: Boolean(snap.mock),
        intent: "EXECUTIVE",
      });
    } catch (e) {
      return formatResponse({
        type: "error",
        summary: e && e.message ? e.message : "executive_snapshot_failed",
        data: { action: "EXECUTIVE", error: e && e.message ? e.message : "error" },
        nextActions: [],
        mock: true,
        intent: "EXECUTIVE",
      });
    }
  }

  if (intent === "SERVICE_DESK") {
    const q = normalize(input);
    const inputRaw = parsed.text;
    const {
      listServiceDeskItems,
      getServiceDeskItem,
      updateServiceDeskItem,
      assignServiceDeskItem,
      closeServiceDeskItem,
      setServiceDeskFlags,
    } = require("./serviceDeskService");
    const { runCustomerServiceAutomation } = require("./customerServiceAutomationEngine");
    const { buildServiceDeskDashboardBundle } = require("./serviceDeskBundle");
    const { getRoleQueue } = require("./teamHandoffEngine");
    const { buildAutoSafeResponse } = require("./autoSafeResponseEngine");
    const sdId = extractServiceDeskId(inputRaw);

    async function logSd(msg) {
      try {
        const { logEvent } = require("./foundationEventLog");
        await logEvent(null, "SERVICE_DESK", String(msg));
      } catch (_e) {
        console.log("[SERVICE_DESK]", msg);
      }
    }

    const statusPayload = (summary, data, actions = []) => ({
      type: "status",
      summary,
      data,
      actionsAvailable: actions,
    });

    try {
      if (/run\s+customer\s+service\s+automation/i.test(q)) {
        const out = await runCustomerServiceAutomation();
        await logSd("command run automation");
        return formatResponse({
          type: "action",
          summary: `Automation: ${out.autoHandled.length} auto-handled, ${out.assigned.length} queued, ${out.escalated.length} escalated.`,
          data: { action: "SERVICE_DESK", result: out },
          nextActions: [],
          mock: false,
          intent: "SERVICE_DESK",
        });
      }

      if (/what\s+customer\s+issues?\s+(need\s+)?owner\s+review/i.test(q)) {
        const bundle = buildServiceDeskDashboardBundle();
        return formatResponse({
          type: "query",
          summary: `${(bundle.ownerExceptions || []).length} owner-review item(s).`,
          data: {
            action: "SERVICE_DESK",
            result: statusPayload(
              "Owner review",
              {
                ownerExceptions: bundle.ownerExceptions,
                serviceDeskSummary: bundle.serviceDeskSummary,
              },
              ["GET /service-desk/owner"]
            ),
          },
          nextActions: [],
          mock: false,
          intent: "SERVICE_DESK",
        });
      }

      if (/show\s+jeremy\s+.*customer|jeremy\s+customer[-\s]?service/i.test(q)) {
        const items = getRoleQueue("PRINTER");
        return formatResponse({
          type: "query",
          summary: `${items.length} printer / customer-service queue item(s).`,
          data: {
            action: "SERVICE_DESK",
            result: statusPayload(
              "Jeremy — customer service queue",
              { role: "PRINTER", items },
              ["GET /service-desk/printer"]
            ),
          },
          nextActions: [],
          mock: false,
          intent: "SERVICE_DESK",
        });
      }

      if (/what\s+was\s+auto[-\s]?handled/i.test(q)) {
        const items = listServiceDeskItems({ state: "AUTO_HANDLED", limit: 50 });
        return formatResponse({
          type: "query",
          summary: `${items.length} auto-handled service item(s).`,
          data: {
            action: "SERVICE_DESK",
            result: statusPayload("Auto-handled", { items }, ["GET /service-desk/auto-handled"]),
          },
          nextActions: [],
          mock: false,
          intent: "SERVICE_DESK",
        });
      }

      if (/what\s+(is\s+)?escalated\b|what'?s\s+escalated\b/i.test(q)) {
        const items = listServiceDeskItems({ state: "ESCALATED", limit: 50 });
        return formatResponse({
          type: "query",
          summary: `${items.length} escalated service item(s).`,
          data: {
            action: "SERVICE_DESK",
            result: statusPayload("Escalated", { items }, ["GET /service-desk/escalated"]),
          },
          nextActions: [],
          mock: false,
          intent: "SERVICE_DESK",
        });
      }

      if (/preview\s+response\s+for\s+service/i.test(q)) {
        if (!sdId) {
          return formatResponse({
            type: "error",
            summary: "Specify service desk id e.g. SD-…",
            data: { action: "SERVICE_DESK", error: "id_required" },
            nextActions: [],
            mock: true,
            intent: "SERVICE_DESK",
          });
        }
        const item = getServiceDeskItem(sdId);
        if (!item) {
          return formatResponse({
            type: "error",
            summary: "Service item not found",
            data: { action: "SERVICE_DESK", error: "not_found" },
            nextActions: [],
            mock: true,
            intent: "SERVICE_DESK",
          });
        }
        const built = await buildAutoSafeResponse(item);
        await logSd(`command preview ${sdId}`);
        return formatResponse({
          type: "query",
          summary: `Preview for ${sdId}`,
          data: { action: "SERVICE_DESK", result: { preview: built, itemId: sdId } },
          nextActions: [`POST /service-desk/${sdId}/preview-response`],
          mock: false,
          intent: "SERVICE_DESK",
        });
      }

      if (/send\s+response\s+for\s+service/i.test(q)) {
        if (!sdId) {
          return formatResponse({
            type: "error",
            summary: "Specify service desk id e.g. SD-…",
            data: { action: "SERVICE_DESK", error: "id_required" },
            nextActions: [],
            mock: true,
            intent: "SERVICE_DESK",
          });
        }
        return formatResponse({
          type: "action",
          summary: `Use POST /service-desk/${sdId}/send-response with body { "mode": "PREVIEW" } or { "mode": "SEND" } (policy applies).`,
          data: {
            action: "SERVICE_DESK",
            result: {
              itemId: sdId,
              endpoint: `POST /service-desk/${sdId}/send-response`,
              body: { mode: "PREVIEW" },
            },
          },
          nextActions: [],
          mock: false,
          intent: "SERVICE_DESK",
        });
      }

      if (
        /what\s+customer\s+service\s+is\s+waiting\s+on\s+us|customer\s+service.*waiting\s+on\s+us/i.test(q)
      ) {
        const items = listServiceDeskItems({ limit: 200 }).filter((r) =>
          /WAITING_TEAM|NEW|READY_TO_SEND|ESCALATED/i.test(String(r.state || ""))
        );
        return formatResponse({
          type: "query",
          summary: `${items.length} item(s) waiting on the team.`,
          data: { action: "SERVICE_DESK", result: { items } },
          nextActions: [],
          mock: false,
          intent: "SERVICE_DESK",
        });
      }

      if (
        /what\s+customer\s+service\s+is\s+waiting\s+on\s+the\s+customer|customer\s+service.*waiting\s+on\s+the\s+customer/i.test(
          q
        )
      ) {
        const items = listServiceDeskItems({ state: "WAITING_CUSTOMER", limit: 100 });
        return formatResponse({
          type: "query",
          summary: `${items.length} item(s) waiting on the customer.`,
          data: { action: "SERVICE_DESK", result: { items } },
          nextActions: [],
          mock: false,
          intent: "SERVICE_DESK",
        });
      }

      if (/escalate\s+service\s+item/i.test(q) && /to\s+me\b/i.test(q)) {
        if (!sdId) {
          return formatResponse({
            type: "error",
            summary: "Specify SD-…",
            data: { action: "SERVICE_DESK", error: "id_required" },
            nextActions: [],
            mock: true,
            intent: "SERVICE_DESK",
          });
        }
        const row = updateServiceDeskItem(sdId, {
          state: "ESCALATED",
          assignedToRole: "OWNER",
          escalationReason: "owner_command_escalate",
        });
        await logSd(`owner escalate ${sdId}`);
        return formatResponse({
          type: "action",
          summary: `Escalated ${sdId} to owner`,
          data: { action: "SERVICE_DESK", result: row },
          nextActions: [],
          mock: false,
          intent: "SERVICE_DESK",
        });
      }

      if (/assign\s+service\s+item/i.test(q)) {
        if (!sdId) {
          return formatResponse({
            type: "error",
            summary: "Specify SD-…",
            data: { action: "SERVICE_DESK", error: "id_required" },
            nextActions: [],
            mock: true,
            intent: "SERVICE_DESK",
          });
        }
        const m = inputRaw.match(/\bto\s+(jeremy|patrick|owner|printer|admin|design)\b/i);
        let role = "ADMIN";
        let uid = null;
        if (m) {
          const x = m[1].toLowerCase();
          if (x === "jeremy") {
            role = "PRINTER";
            uid = "jeremy";
          } else if (x === "patrick" || x === "owner") {
            role = "OWNER";
            uid = "patrick";
          } else if (x === "printer") role = "PRINTER";
          else if (x === "admin") role = "ADMIN";
          else if (x === "design") role = "DESIGN";
        }
        const row = assignServiceDeskItem(sdId, {
          assignedToRole: role,
          assignedToUserId: uid,
          state: "WAITING_TEAM",
        });
        await logSd(`assign ${sdId} -> ${role}`);
        return formatResponse({
          type: "action",
          summary: `Assigned ${sdId} → ${role}`,
          data: { action: "SERVICE_DESK", result: row },
          nextActions: [],
          mock: false,
          intent: "SERVICE_DESK",
        });
      }

      if (/mark\s+service\s+item.*\bclosed\b/i.test(q)) {
        if (!sdId) {
          return formatResponse({
            type: "error",
            summary: "Specify SD-…",
            data: { action: "SERVICE_DESK", error: "id_required" },
            nextActions: [],
            mock: true,
            intent: "SERVICE_DESK",
          });
        }
        const row = closeServiceDeskItem(sdId);
        await logSd(`close ${sdId}`);
        return formatResponse({
          type: "action",
          summary: `Closed ${sdId}`,
          data: { action: "SERVICE_DESK", result: row },
          nextActions: [],
          mock: false,
          intent: "SERVICE_DESK",
        });
      }

      if (/force\s+preview\s+only/i.test(q)) {
        setServiceDeskFlags({ forcePreviewOnly: true });
        await logSd("force_preview_only on");
        return formatResponse({
          type: "action",
          summary: "Service-desk outbound sends are preview-only until flags cleared.",
          data: { action: "SERVICE_DESK", result: { forcePreviewOnly: true } },
          nextActions: [],
          mock: false,
          intent: "SERVICE_DESK",
        });
      }

      if (/auto[-\s]?handle\s+all\s+missing\s+info/i.test(q)) {
        const out = await runCustomerServiceAutomation();
        await logSd("bulk auto-handle missing info");
        return formatResponse({
          type: "action",
          summary: "Ran customer service automation (missing-info intakes).",
          data: { action: "SERVICE_DESK", result: out },
          nextActions: [],
          mock: false,
          intent: "SERVICE_DESK",
        });
      }

      const bundle = buildServiceDeskDashboardBundle();
      return formatResponse({
        type: "query",
        summary: "Service desk summary",
        data: {
          action: "SERVICE_DESK",
          result: statusPayload(
            "Service desk",
            bundle,
            ["GET /service-desk", "POST /service-desk/run"]
          ),
        },
        nextActions: [],
        mock: false,
        intent: "SERVICE_DESK",
      });
    } catch (e) {
      return formatResponse({
        type: "error",
        summary: e && e.message ? e.message : "service_desk_error",
        data: { action: "SERVICE_DESK", error: e && e.message ? e.message : "error" },
        nextActions: [],
        mock: true,
        intent: "SERVICE_DESK",
      });
    }
  }

  if (intent === "OPERATOR_VIEW") {
    const { getOperatorView } = require("./operatorViewService");
    const m = parsed.text.match(/show\s+(printer|admin|owner|design)\s+board/i);
    const roleKey = m ? String(m[1]).toUpperCase() : "PRINTER";
    const roleMap = { PRINTER: "PRINTER", ADMIN: "ADMIN", OWNER: "OWNER", DESIGN: "DESIGN" };
    const r = roleMap[roleKey] || "PRINTER";
    try {
      const view = await getOperatorView(r);
      return formatResponse({
        type: "query",
        summary: `${r} operator board`,
        data: {
          action: "OPERATOR_VIEW",
          result: {
            type: "status",
            summary: `Operator (${r})`,
            data: view,
            actionsAvailable: [`GET /operator/${roleKey.toLowerCase()}`],
          },
        },
        nextActions: [],
        mock: false,
        intent: "OPERATOR_VIEW",
      });
    } catch (e) {
      return formatResponse({
        type: "error",
        summary: e && e.message ? e.message : "operator_view_failed",
        data: { action: "OPERATOR_VIEW", error: e && e.message ? e.message : "error" },
        nextActions: [],
        mock: true,
        intent: "OPERATOR_VIEW",
      });
    }
  }

  if (
    intent === "AUTOMATION_RUN" ||
    intent === "AUTOMATION_STATUS" ||
    intent === "AUTOMATION_LOGS" ||
    intent === "AUTOMATION_PAUSE" ||
    intent === "AUTOMATION_RESUME"
  ) {
    const runner = require("./automationRunner");
    const { getRecentLogs } = require("./automationLogService");
    const { getSchedulerStatus } = require("./automationScheduler");
    try {
      if (intent === "AUTOMATION_RUN") {
        const out = await runner.runAutomationCycle({ label: "command", skipGate: true });
        return formatResponse({
          type: "action",
          summary:
            out.errors && out.errors.length
              ? `Automation finished with ${out.errors.length} error(s)`
              : "Automation cycle completed",
          data: { action: "AUTOMATION", result: out },
          nextActions: ["GET /automation/logs"],
          mock: !!out.mock,
          intent,
        });
      }
      if (intent === "AUTOMATION_STATUS") {
        const cfg = runner.getAutomationConfig();
        const st = runner.loadState();
        const sch = getSchedulerStatus();
        return formatResponse({
          type: "query",
          summary: cfg.paused
            ? "Automation is paused"
            : sch.started
              ? "Automation cron is running"
              : "Automation cron idle (set AUTOMATION_CRON_ENABLED=true)",
          data: { action: "AUTOMATION", config: cfg, paused: !!st.paused, scheduler: sch },
          nextActions: ["GET /automation/status"],
          mock: false,
          intent,
        });
      }
      if (intent === "AUTOMATION_LOGS") {
        const entries = getRecentLogs(15);
        return formatResponse({
          type: "query",
          summary: `${entries.length} recent automation log entr(ies)`,
          data: { action: "AUTOMATION", entries },
          nextActions: [],
          mock: false,
          intent,
        });
      }
      if (intent === "AUTOMATION_PAUSE") {
        runner.setAutomationPaused(true);
        return formatResponse({
          type: "action",
          summary: "Automation paused",
          data: { action: "AUTOMATION", paused: true },
          nextActions: [],
          mock: false,
          intent,
        });
      }
      if (intent === "AUTOMATION_RESUME") {
        runner.setAutomationPaused(false);
        return formatResponse({
          type: "action",
          summary: "Automation resumed",
          data: { action: "AUTOMATION", paused: false },
          nextActions: [],
          mock: false,
          intent,
        });
      }
    } catch (e) {
      return formatResponse({
        type: "error",
        summary: e && e.message ? e.message : "automation_error",
        data: { action: "AUTOMATION", error: e && e.message ? e.message : "error" },
        nextActions: [],
        mock: true,
        intent,
      });
    }
  }

  if (intent === "TEAM") {
    const { getTeamBoardData } = require("./teamBoardService");
    const { getAssignments } = require("./teamTaskStore");
    const { getMemberById } = require("./teamService");
    const { pauseJob, forceJobBullseye, markJobComplete } = require("./productionFlowEngine");
    const { reassignTask } = require("./taskStateEngine");
    const q = normalize(input);

    async function logTeam(msg) {
      try {
        const { logEvent } = require("./foundationEventLog");
        await logEvent(null, "TEAM_EXECUTION", String(msg));
      } catch (_e) {
        console.log("[TEAM]", msg);
      }
    }

    const statusPayload = (summary, data, actions = []) => ({
      type: "status",
      summary,
      data,
      actionsAvailable: actions,
    });

    try {
      const board = await getTeamBoardData();
      await logTeam(`command:${q.slice(0, 160)}`);

      if (/show\s+jeremy|show\s+patrick/i.test(q)) {
        const m = input.match(/\b(jeremy|patrick)\b/i);
        const uid = m ? m[1].toLowerCase() : "jeremy";
        const mem = getMemberById(uid);
        const mine = getAssignments().filter((a) => String(a.assignedTo).toLowerCase() === uid);
        return formatResponse({
          type: "query",
          summary: `${mine.length} task(s) for ${mem ? mem.name : uid}`,
          data: {
            action: "TEAM",
            result: statusPayload(
              `${mine.length} open team task(s)`,
              { member: mem, tasks: mine },
              ["GET /team/" + uid]
            ),
          },
          nextActions: [],
          mock: false,
          intent: "TEAM",
        });
      }

      if (/what\s+is\s+in\s+production|what'?s\s+in\s+production/i.test(q)) {
        return formatResponse({
          type: "query",
          summary: `${board.inProgress.length} task(s) in progress on the floor`,
          data: {
            action: "TEAM",
            result: statusPayload("In production", { inProgress: board.inProgress }, []),
          },
          nextActions: [],
          mock: false,
          intent: "TEAM",
        });
      }

      if (/what\s+is\s+blocked\b|blocked\s+tasks|team\s+blocked/i.test(q)) {
        return formatResponse({
          type: "query",
          summary: `${board.blocked.length} blocked task(s)`,
          data: {
            action: "TEAM",
            result: statusPayload("Blocked tasks", { blocked: board.blocked }, []),
          },
          nextActions: [],
          mock: false,
          intent: "TEAM",
        });
      }

      if (/what\s+is\s+complete\s+today|what'?s\s+complete\s+today|completed\s+today/i.test(q)) {
        return formatResponse({
          type: "query",
          summary: `${(board.completedToday || []).length} task(s) completed today`,
          data: {
            action: "TEAM",
            result: statusPayload("Completed today", { completedToday: board.completedToday, date: board.date }, []),
          },
          nextActions: [],
          mock: false,
          intent: "TEAM",
        });
      }

      if (/pause\s+job/i.test(q)) {
        const jid = extractJobIdFromCommand(input);
        if (!jid) {
          return formatResponse({
            type: "error",
            summary: "Specify job id e.g. JOB-…",
            data: { action: "TEAM", error: "job_required" },
            nextActions: [],
            mock: true,
            intent: "TEAM",
          });
        }
        const out = pauseJob(jid, true);
        await logTeam(`pause_job ${jid}`);
        return formatResponse({
          type: "action",
          summary: `Job ${jid} paused for team automation`,
          data: { action: "TEAM", result: out },
          nextActions: [],
          mock: false,
          intent: "TEAM",
        });
      }

      if (/force.*bullseye|force\s+job.*bullseye/i.test(q)) {
        const jid = extractJobIdFromCommand(input);
        if (!jid) {
          return formatResponse({
            type: "error",
            summary: "Specify job id e.g. JOB-…",
            data: { action: "TEAM", error: "job_required" },
            nextActions: [],
            mock: true,
            intent: "TEAM",
          });
        }
        const out = forceJobBullseye(jid);
        await logTeam(`force_bullseye ${jid}`);
        return formatResponse({
          type: "action",
          summary: `Override recorded for ${jid} → Bullseye`,
          data: { action: "TEAM", result: out },
          nextActions: [],
          mock: false,
          intent: "TEAM",
        });
      }

      if (/mark\s+job.*complete/i.test(q)) {
        const jid = extractJobIdFromCommand(input);
        if (!jid) {
          return formatResponse({
            type: "error",
            summary: "Specify job id e.g. JOB-…",
            data: { action: "TEAM", error: "job_required" },
            nextActions: [],
            mock: true,
            intent: "TEAM",
          });
        }
        const out = markJobComplete(jid);
        await logTeam(`mark_complete ${jid}`);
        return formatResponse({
          type: "action",
          summary: `Job ${jid} marked complete in team layer`,
          data: { action: "TEAM", result: out },
          nextActions: [],
          mock: false,
          intent: "TEAM",
        });
      }

      if (/reassign\s+task/i.test(q)) {
        const m = String(input).match(/\b(TT-[A-Za-z0-9-]+)\b.*\bto\s+(jeremy|patrick)\b/i);
        if (!m) {
          return formatResponse({
            type: "error",
            summary: 'Say: reassign task TT-… to jeremy',
            data: { action: "TEAM", error: "task_or_user_required" },
            nextActions: [],
            mock: true,
            intent: "TEAM",
          });
        }
        const r = await reassignTask(m[1], m[2]);
        await logTeam(`reassign ${m[1]} -> ${m[2]}`);
        return formatResponse({
          type: r.success ? "action" : "error",
          summary: r.success ? `Task ${m[1]} → ${m[2]}` : String(r.error || "reassign_failed"),
          data: { action: "TEAM", result: r },
          nextActions: [],
          mock: false,
          intent: "TEAM",
        });
      }

      return formatResponse({
        type: "query",
        summary: `Team: ${board.inProgress.length} in progress, ${board.blocked.length} blocked, ${board.assignedTasks.length} queued`,
        data: {
          action: "TEAM",
          result: statusPayload("Team board", board, ["GET /team/board"]),
        },
        nextActions: ["Show Jeremy's tasks", "What is blocked"],
        mock: false,
        intent: "TEAM",
      });
    } catch (e) {
      return formatResponse({
        type: "error",
        summary: e && e.message ? e.message : "team_error",
        data: { action: "TEAM", error: e && e.message ? e.message : "error" },
        nextActions: [],
        mock: true,
        intent: "TEAM",
      });
    }
  }

  if (intent === "COMMUNICATION") {
    const { buildCommunicationRecommendations } = require("./communicationDecisionEngine");
    const { sendCommunication, previewCommunication } = require("./communicationOrchestrator");
    const { getRelatedCommunicationTimeline } = require("./communicationHistoryService");
    const { listCommunications } = require("./communicationService");
    const { buildInvoiceReminderMessage } = require("./stateMessageService");
    const q = normalize(input);
    const confirmSend =
      (body && body.confirmSend === true) ||
      (body && body.confirm === true) ||
      parsed.confirm === true;

    try {
      if (/what communications are ready|communications are ready/i.test(q)) {
        const { recommendations, meta } = await buildCommunicationRecommendations();
        return formatResponse({
          type: "query",
          summary: `${(recommendations || []).length} communication recommendation(s) — preview before send.`,
          data: {
            action: "COMMUNICATION",
            result: { intent: "COMMUNICATION", recommendations, meta },
          },
          nextActions: ["Preview invoice reminders"],
          mock: Boolean(meta && meta.squareMock),
          intent: "COMMUNICATION",
        });
      }
      if (/what customers need follow-up|customers need follow-up|need follow-up/i.test(q)) {
        const { recommendations } = await buildCommunicationRecommendations();
        const cust = (recommendations || []).filter((r) => /CUSTOMER|INTAKE|JOB|INVOICE/i.test(String(r.type)));
        return formatResponse({
          type: "query",
          summary: `${cust.length} follow-up candidate(s) from current recommendations.`,
          data: {
            action: "COMMUNICATION",
            result: { intent: "COMMUNICATION", followUps: cust, recommendations },
          },
          nextActions: [],
          mock: false,
          intent: "COMMUNICATION",
        });
      }
      if (/preview missing info emails/i.test(q)) {
        const { recommendations } = await buildCommunicationRecommendations();
        const hits = (recommendations || []).filter((r) => r.templateKey === "MISSING_INFO").slice(0, 8);
        const previews = [];
        for (const h of hits) {
          previews.push(
            await previewCommunication({
              templateKey: "MISSING_INFO",
              relatedType: h.relatedType,
              relatedId: h.relatedId,
              channel: "EMAIL",
            })
          );
        }
        return formatResponse({
          type: "query",
          summary: `Preview ${previews.length} missing-info message(s).`,
          data: { action: "COMMUNICATION", result: { intent: "COMMUNICATION", previews } },
          nextActions: [],
          mock: false,
          intent: "COMMUNICATION",
        });
      }
      if (/preview invoice reminders/i.test(q)) {
        const { recommendations } = await buildCommunicationRecommendations();
        const hits = (recommendations || []).filter((r) => r.templateKey === "INVOICE_REMINDER").slice(0, 8);
        const previews = [];
        for (const h of hits) {
          previews.push(
            await buildInvoiceReminderMessage(
              h.relatedType === "JOB" ? h.relatedId : h.squareInvoiceId || h.relatedId
            )
          );
        }
        return formatResponse({
          type: "query",
          summary: `Preview ${previews.length} invoice reminder(s).`,
          data: { action: "COMMUNICATION", result: { intent: "COMMUNICATION", previews } },
          nextActions: [],
          mock: false,
          intent: "COMMUNICATION",
        });
      }
      if (/send pickup text for job/i.test(q)) {
        const jid = extractJobIdFromCommand(input);
        if (!jid) {
          return formatResponse({
            type: "error",
            summary: "Specify job id e.g. JOB-…",
            data: { action: "COMMUNICATION", error: "job_required" },
            nextActions: [],
            mock: true,
            intent: "COMMUNICATION",
          });
        }
        const out = await sendCommunication(
          {
            templateKey: "READY_FOR_PICKUP",
            relatedType: "JOB",
            relatedId: jid,
            channel: "SMS",
          },
          confirmSend ? "SEND" : "PREVIEW",
          { confirmSend }
        );
        return formatResponse({
          type: out.sent ? "action" : "query",
          summary: out.sent
            ? `Pickup SMS queued/sent for ${jid} (provider must confirm).`
            : out.approvalRequired
              ? `Approval required — use approvalId ${out.approvalId || ""} or confirmSend.`
              : String(out.error || "preview or blocked"),
          data: { action: "COMMUNICATION", result: { intent: "COMMUNICATION", ...out } },
          nextActions: [],
          mock: false,
          intent: "COMMUNICATION",
        });
      }
      if (/send deposit reminder for job/i.test(q)) {
        const jid = extractJobIdFromCommand(input);
        if (!jid) {
          return formatResponse({
            type: "error",
            summary: "Specify job id e.g. JOB-…",
            data: { action: "COMMUNICATION", error: "job_required" },
            nextActions: [],
            mock: true,
            intent: "COMMUNICATION",
          });
        }
        const out = await sendCommunication(
          {
            templateKey: "DEPOSIT_REQUIRED",
            relatedType: "JOB",
            relatedId: jid,
            channel: "EMAIL",
          },
          confirmSend ? "SEND" : "PREVIEW",
          { confirmSend }
        );
        return formatResponse({
          type: out.sent ? "action" : "query",
          summary: out.sent ? `Deposit reminder sent for ${jid}.` : String(out.error || "preview or blocked"),
          data: { action: "COMMUNICATION", result: { intent: "COMMUNICATION", ...out } },
          nextActions: [],
          mock: false,
          intent: "COMMUNICATION",
        });
      }
      if (/show communication history for job|communication history for job/i.test(q)) {
        const jid = extractJobIdFromCommand(input);
        if (!jid) {
          return formatResponse({
            type: "error",
            summary: "Specify job id e.g. JOB-…",
            data: { action: "COMMUNICATION", error: "job_required" },
            nextActions: [],
            mock: true,
            intent: "COMMUNICATION",
          });
        }
        const tl = getRelatedCommunicationTimeline("JOB", jid);
        return formatResponse({
          type: "query",
          summary: `${(tl.timeline || []).length} communication event(s) for ${jid}.`,
          data: { action: "COMMUNICATION", result: { intent: "COMMUNICATION", ...tl } },
          nextActions: [],
          mock: false,
          intent: "COMMUNICATION",
        });
      }
      if (/what messages failed|messages failed/i.test(q)) {
        const rows = listCommunications({ status: "FAILED", limit: 40 });
        return formatResponse({
          type: "query",
          summary: `${rows.length} failed communication(s).`,
          data: { action: "COMMUNICATION", result: { intent: "COMMUNICATION", failed: rows } },
          nextActions: [],
          mock: false,
          intent: "COMMUNICATION",
        });
      }
      if (/pending approval|what is pending approval/i.test(q)) {
        const rows = listCommunications({ status: "PENDING_APPROVAL", limit: 40 });
        return formatResponse({
          type: "query",
          summary: `${rows.length} communication(s) pending approval.`,
          data: { action: "COMMUNICATION", result: { intent: "COMMUNICATION", pending: rows } },
          nextActions: [],
          mock: false,
          intent: "COMMUNICATION",
        });
      }

      const { recommendations, meta } = await buildCommunicationRecommendations();
      return formatResponse({
        type: "query",
        summary: "Communications — ask what is ready, preview reminders, or history for a job.",
        data: {
          action: "COMMUNICATION",
          result: { intent: "COMMUNICATION", recommendations, meta },
        },
        nextActions: ["What communications are ready?"],
        mock: Boolean(meta && meta.squareMock),
        intent: "COMMUNICATION",
      });
    } catch (e) {
      return formatResponse({
        type: "error",
        summary: e && e.message ? e.message : "communication_error",
        data: { action: "COMMUNICATION", error: e && e.message ? e.message : "error" },
        nextActions: [],
        mock: true,
        intent: "COMMUNICATION",
      });
    }
  }

  if (intent === "VENDOR_OUTBOUND") {
    const {
      previewPurchaseOrdersForSend,
      sendPurchaseOrder,
      previewBullseyeDirectShip,
      approveAndSend,
      getOutboundDashboardSlice,
    } = require("./vendorOutboundEngine");
    const { listPendingApprovals } = require("./approvalEngine");
    const q = normalize(input);
    try {
      if (/what\s+purchase\s+orders\s+are\s+ready|preview\s+purchase\s+orders/i.test(q)) {
        const list = await previewPurchaseOrdersForSend();
        const dash = getOutboundDashboardSlice();
        return formatResponse({
          type: "query",
          summary: `Outbound: ${(list.purchaseOrders || []).length} PO(s) in registry; ready flags set when valid.`,
          data: {
            action: "VENDOR_OUTBOUND",
            result: { intent: "VENDOR_OUTBOUND", ...list, ...dash },
          },
          nextActions: ["Preview PO for Carolina Made", "Approve and send PO-…"],
          mock: Boolean(list.mock),
          intent: "VENDOR_OUTBOUND",
        });
      }
      if (/preview\s+bullseye\s+direct/i.test(q)) {
        let poGuess = extractPoFromCommand(input);
        if (!poGuess) {
          const list = await previewPurchaseOrdersForSend();
          const first = (list.purchaseOrders || []).find((x) => x.directShipCandidate);
          poGuess = first ? first.poNumber : (list.purchaseOrders || [])[0] && (list.purchaseOrders || [])[0].poNumber;
        }
        const out = poGuess
          ? await previewBullseyeDirectShip(poGuess)
          : { success: false, error: "no_po_for_bullseye_preview" };
        return formatResponse({
          type: "query",
          summary: out.success ? "Bullseye direct-ship preview ready." : "Could not build Bullseye preview.",
          data: { action: "VENDOR_OUTBOUND", result: { intent: "VENDOR_OUTBOUND", ...out } },
          nextActions: [],
          mock: Boolean(out.mock),
          intent: "VENDOR_OUTBOUND",
        });
      }
      if (/approve\s+and\s+send\s+po/i.test(q)) {
        const poNum = extractPoFromCommand(input);
        const pend = listPendingApprovals().find(
          (a) =>
            a.type === "VENDOR_PO_SEND" &&
            poNum &&
            a.payload &&
            String(a.payload.poNumber) === String(poNum),
        );
        if (!pend) {
          return formatResponse({
            type: "error",
            summary: `No pending approval for ${poNum || "that PO"} — run preview first.`,
            data: { action: "VENDOR_OUTBOUND", result: { intent: "VENDOR_OUTBOUND", error: "no_pending_approval" } },
            nextActions: ["Preview purchase orders"],
            mock: true,
            intent: "VENDOR_OUTBOUND",
          });
        }
        const out = await approveAndSend(pend.id);
        return formatResponse({
          type: out.sent ? "action" : "error",
          summary: out.sent ? `Sent PO ${poNum}` : `Send blocked: ${out.error || "unknown"}`,
          data: { action: "VENDOR_OUTBOUND", result: { intent: "VENDOR_OUTBOUND", ...out } },
          nextActions: [],
          mock: Boolean(out.mock),
          intent: "VENDOR_OUTBOUND",
        });
      }
      if (/^send\s+po\b|send\s+purchase\s+order\s+to\s+supplier/i.test(q)) {
        const poNum = extractPoFromCommand(input);
        if (!poNum) {
          return formatResponse({
            type: "error",
            summary: "Specify a PO number (e.g. PO-20260417-001).",
            data: { action: "VENDOR_OUTBOUND", result: { error: "po_required" } },
            nextActions: [],
            mock: true,
            intent: "VENDOR_OUTBOUND",
          });
        }
        const pend = listPendingApprovals().find(
          (a) => a.type === "VENDOR_PO_SEND" && a.payload && String(a.payload.poNumber) === String(poNum),
        );
        if (!pend) {
          return formatResponse({
            type: "error",
            summary: "No pending approval — preview the PO first, then approve.",
            data: { action: "VENDOR_OUTBOUND", result: { error: "approval_required" } },
            nextActions: [`Preview PO ${poNum}`],
            mock: true,
            intent: "VENDOR_OUTBOUND",
          });
        }
        const out = await approveAndSend(pend.id);
        return formatResponse({
          type: out.sent ? "action" : "error",
          summary: out.sent ? `Sent ${poNum}` : String(out.error || "send_failed"),
          data: { action: "VENDOR_OUTBOUND", result: { intent: "VENDOR_OUTBOUND", ...out } },
          nextActions: [],
          mock: Boolean(out.mock),
          intent: "VENDOR_OUTBOUND",
        });
      }
      const poNum =
        extractPoFromCommand(input) ||
        (function vendorPoGuess(t) {
          const low = normalize(t);
          if (/carolina\s+made/i.test(low)) {
            const { getAllPurchaseOrders } = require("./poRegistryService");
            const { getVendorBySupplierName } = require("./vendorProfileService");
            getVendorBySupplierName("Carolina Made");
            const all = getAllPurchaseOrders();
            const hit = all.find((p) => String(p.supplier || "").toLowerCase().includes("carolina"));
            return hit ? hit.poNumber : "";
          }
          return "";
        })(input);
      if (!poNum) {
        const list = await previewPurchaseOrdersForSend();
        return formatResponse({
          type: "query",
          summary: "Vendor outbound — specify PO or ask what is ready.",
          data: { action: "VENDOR_OUTBOUND", result: { intent: "VENDOR_OUTBOUND", ...list } },
          nextActions: ["Preview purchase orders"],
          mock: Boolean(list.mock),
          intent: "VENDOR_OUTBOUND",
        });
      }
      const out = await sendPurchaseOrder(poNum, "PREVIEW", "");
      return formatResponse({
        type: "query",
        summary: out.success ? `Preview ready for ${poNum}` : String(out.error || "preview_failed"),
        data: { action: "VENDOR_OUTBOUND", result: { intent: "VENDOR_OUTBOUND", ...out } },
        nextActions: [`Approve and send ${poNum}`],
        mock: Boolean(out.mock),
        intent: "VENDOR_OUTBOUND",
      });
    } catch (e) {
      return formatResponse({
        type: "error",
        summary: e && e.message ? e.message : "vendor_outbound_error",
        data: { action: "VENDOR_OUTBOUND", error: e && e.message ? e.message : "error" },
        nextActions: [],
        mock: true,
        intent: "VENDOR_OUTBOUND",
      });
    }
  }

  if (intent === "INTAKE") {
    const intakeSvc = require("./intakeService");
    const q = normalize(input);
    try {
      const dash = intakeSvc.getIntakeDashboardSnapshot();
      if (/show\s+new\s+orders\s+from\s+today|new\s+orders\s+from\s+today/i.test(q)) {
        const todayIso = new Date().toISOString().slice(0, 10);
        const rows = intakeSvc.getIntakeRecords({
          since: `${todayIso}T00:00:00.000Z`,
          intent: "NEW_ORDER",
          limit: 80,
        });
        return formatResponse({
          type: "query",
          summary: `${rows.length} NEW_ORDER intake(s) recorded today (by timestamp).`,
          data: { action: "INTAKE", result: { intent: "INTAKE", newOrdersToday: rows } },
          nextActions: ["Show new inquiries"],
          mock: false,
          intent: "INTAKE",
        });
      }
      if (/show\s+new\s+inquiries|new\s+inquiries\s+from\s+today|recent\s+inquiries/i.test(q)) {
        const today = new Date().toISOString().slice(0, 10);
        const todayRows = intakeSvc.getIntakeRecords({ since: `${today}T00:00:00.000Z`, limit: 50 });
        return formatResponse({
          type: "query",
          summary: `${dash.intakeSummary.newTodayCount || todayRows.length} new intake(s) today; ${dash.recentInquiries.length} recent.`,
          data: {
            action: "INTAKE",
            result: {
              intent: "INTAKE",
              intakeSummary: dash.intakeSummary,
              recentInquiries: todayRows.length ? todayRows : dash.recentInquiries,
            },
          },
          nextActions: ["What intake records need info?"],
          mock: false,
          intent: "INTAKE",
        });
      }
      if (/what\s+intake\s+records\s+need\s+info|need\s+info/i.test(q)) {
        const rows = intakeSvc.getIntakeRecords({ status: "NEEDS_INFO", limit: 40 });
        return formatResponse({
          type: "query",
          summary: `${rows.length} intake record(s) need more information.`,
          data: { action: "INTAKE", result: { intent: "INTAKE", records: rows } },
          nextActions: [],
          mock: false,
          intent: "INTAKE",
        });
      }
      if (/ready\s+for\s+quote/i.test(q)) {
        const rows = intakeSvc.getIntakeRecords({ status: "READY_FOR_QUOTE", limit: 40 });
        return formatResponse({
          type: "query",
          summary: `${rows.length} ready for quote.`,
          data: { action: "INTAKE", result: { intent: "INTAKE", readyForQuote: rows } },
          nextActions: [],
          mock: false,
          intent: "INTAKE",
        });
      }
      if (/intake/i.test(q) && /ready\s+for\s+job/i.test(q)) {
        const rows = intakeSvc.getIntakeRecords({ status: "READY_FOR_JOB", limit: 40 });
        return formatResponse({
          type: "query",
          summary: `${rows.length} intake(s) ready for job conversion.`,
          data: { action: "INTAKE", result: { intent: "INTAKE", readyForJob: rows } },
          nextActions: [],
          mock: false,
          intent: "INTAKE",
        });
      }
      if (/review\s*required/i.test(q)) {
        const rows = intakeSvc.getIntakeRecords({ status: "REVIEW_REQUIRED", limit: 40 });
        return formatResponse({
          type: "query",
          summary: `${rows.length} intake(s) need review.`,
          data: { action: "INTAKE", result: { intent: "INTAKE", reviewRequired: rows } },
          nextActions: [],
          mock: false,
          intent: "INTAKE",
        });
      }
      if (/convert\s+intake/i.test(q)) {
        const id = extractIntakeId(input);
        if (!id) {
          return formatResponse({
            type: "error",
            summary: "Specify intake id e.g. INT-abc123.",
            data: { action: "INTAKE", error: "intake_id_required" },
            nextActions: [],
            mock: true,
            intent: "INTAKE",
          });
        }
        const toJob = /to\s+job|convert.*job/i.test(q);
        const toQuote = /to\s+quote|convert.*quote/i.test(q);
        if (toJob) {
          const out = await intakeSvc.convertIntakeToJob(id);
          return formatResponse({
            type: out.success ? "action" : "error",
            summary: out.success ? `Converted ${id} to job ${out.job && out.job.jobId}` : String(out.error || "convert_failed"),
            data: { action: "INTAKE", result: { intent: "INTAKE", ...out } },
            nextActions: [],
            mock: false,
            intent: "INTAKE",
          });
        }
        if (toQuote) {
          const out = await intakeSvc.convertIntakeToQuoteDraft(id);
          return formatResponse({
            type: out.success ? "action" : "error",
            summary: out.success ? `Quote draft ${out.quoteRef}` : String(out.error),
            data: { action: "INTAKE", result: { intent: "INTAKE", ...out } },
            nextActions: [],
            mock: false,
            intent: "INTAKE",
          });
        }
        return formatResponse({
          type: "error",
          summary: "Say convert intake INT-… to job or to quote.",
          data: { action: "INTAKE", error: "convert_target_ambiguous" },
          nextActions: [],
          mock: true,
          intent: "INTAKE",
        });
      }
      if (/include\s+art|art\?/i.test(q)) {
        const recent = intakeSvc.getIntakeRecords({ limit: 15 });
        const withArt = recent.filter((r) => r.artDetected);
        return formatResponse({
          type: "query",
          summary: `${withArt.length} of last ${recent.length} intakes flagged art/attachments (metadata-based).`,
          data: { action: "INTAKE", result: { intent: "INTAKE", withArt } },
          nextActions: [],
          mock: false,
          intent: "INTAKE",
        });
      }
      return formatResponse({
        type: "query",
        summary: "Intake overview.",
        data: { action: "INTAKE", result: { intent: "INTAKE", ...dash } },
        nextActions: ["Show new inquiries", "What is ready for quote?"],
        mock: false,
        intent: "INTAKE",
      });
    } catch (e) {
      return formatResponse({
        type: "error",
        summary: e && e.message ? e.message : "intake_error",
        data: { action: "INTAKE", error: e && e.message ? e.message : "error" },
        nextActions: [],
        mock: true,
        intent: "INTAKE",
      });
    }
  }

  if (intent === "SQUARE") {
    const syncEng = require("./squareSyncEngine");
    const readSvc = require("./squareReadService");
    const reconSvc = require("./financialReconciliationService");
    const writeSvc = require("./squareWriteService");
    const q = normalize(input);
    try {
      if (/sync\s+square|square\s+sync/i.test(q)) {
        const out = await syncEng.syncFromSquare();
        return formatResponse({
          type: "action",
          summary: `Square sync ${out.mock ? "(degraded/mock)" : "complete"} — jobs touched: ${(out.updatedJobs || []).length}`,
          data: { action: "SQUARE", result: { intent: "SQUARE", ...out } },
          nextActions: ["What invoices are unpaid?"],
          mock: Boolean(out.mock),
          intent: "SQUARE",
        });
      }
      if (/unpaid\s+invoices|invoices\s+are\s+unpaid|what\s+invoices/i.test(q)) {
        const inv = await readSvc.getSquareInvoices();
        const unpaid = (inv.invoices || []).filter((i) => !/^PAID$/i.test(String(i.status || "")));
        return formatResponse({
          type: "query",
          summary: `${unpaid.length} unpaid / non-paid invoice(s) in last fetch.`,
          data: { action: "SQUARE", result: { intent: "SQUARE", unpaid } },
          nextActions: [],
          mock: Boolean(inv.mock),
          intent: "SQUARE",
        });
      }
      if (/open\s+estimates|estimates\s+are\s+open|what\s+estimates/i.test(q)) {
        const est = await readSvc.getSquareEstimates();
        return formatResponse({
          type: "query",
          summary: `${(est.estimates || []).length} open estimate-like invoice(s).`,
          data: { action: "SQUARE", result: { intent: "SQUARE", estimates: est.estimates } },
          nextActions: [],
          mock: Boolean(est.mock),
          intent: "SQUARE",
        });
      }
      if (/blocked\s+by\s+payment|blocked.*payment|which\s+jobs/i.test(q)) {
        const bundle = await syncEng.getSquareDashboardBundle();
        return formatResponse({
          type: "query",
          summary: `${(bundle.paymentBlockedJobs || []).length} job(s) blocked on payment rules.`,
          data: { action: "SQUARE", result: { intent: "SQUARE", paymentBlockedJobs: bundle.paymentBlockedJobs } },
          nextActions: [],
          mock: Boolean(bundle.squareStatus && bundle.squareStatus.mock),
          intent: "SQUARE",
        });
      }
      if (/reconciliation|reconciliation\s+issues/i.test(q)) {
        const r = await reconSvc.reconcileSquareToSystem();
        return formatResponse({
          type: "query",
          summary: `${(r.duplicates || []).length} duplicate/mismatch flag(s).`,
          data: { action: "SQUARE", result: { intent: "SQUARE", ...r } },
          nextActions: [],
          mock: Boolean(r.mock),
          intent: "SQUARE",
        });
      }
      if (/preview\s+quote/i.test(q)) {
        const intakeId = extractIntakeId(input);
        const jobId = extractJobIdFromCommand(input);
        const out = await writeSvc.previewQuoteDraft({ intakeId: intakeId || undefined, jobId: jobId || undefined });
        return formatResponse({
          type: out.success ? "query" : "error",
          summary: out.success ? "Quote preview ready." : String(out.error || "preview_failed"),
          data: { action: "SQUARE", result: { intent: "SQUARE", ...out } },
          nextActions: [],
          mock: Boolean(out.mock),
          intent: "SQUARE",
        });
      }
      if (/create\s+draft\s+quote/i.test(q)) {
        const intakeId = extractIntakeId(input);
        const jobId = extractJobIdFromCommand(input);
        const out = await writeSvc.createDraftQuote({ mode: "CREATE", intakeId: intakeId || undefined, jobId: jobId || undefined });
        return formatResponse({
          type: out.created ? "action" : "error",
          summary: out.created ? "Draft quote order created in Square (order id in squareIds)." : String(out.error || "not_created"),
          data: { action: "SQUARE", result: { intent: "SQUARE", ...out } },
          nextActions: [],
          mock: Boolean(out.mock),
          intent: "SQUARE",
        });
      }
      if (/preview\s+invoice/i.test(q)) {
        const jobId = extractJobIdFromCommand(input);
        if (!jobId) {
          return formatResponse({
            type: "error",
            summary: "Specify job id e.g. JOB-…",
            data: { action: "SQUARE", error: "jobId_required" },
            nextActions: [],
            mock: true,
            intent: "SQUARE",
          });
        }
        const out = await writeSvc.previewInvoiceDraft({ jobId });
        return formatResponse({
          type: out.success ? "query" : "error",
          summary: out.success ? "Invoice preview ready." : String(out.error || "preview_failed"),
          data: { action: "SQUARE", result: { intent: "SQUARE", ...out } },
          nextActions: [],
          mock: Boolean(out.mock),
          intent: "SQUARE",
        });
      }
      if (/create\s+draft\s+invoice/i.test(q)) {
        const jobId = extractJobIdFromCommand(input);
        if (!jobId) {
          return formatResponse({
            type: "error",
            summary: "Specify job id e.g. JOB-…",
            data: { action: "SQUARE", error: "jobId_required" },
            nextActions: [],
            mock: true,
            intent: "SQUARE",
          });
        }
        const out = await writeSvc.createDraftInvoice({ jobId, mode: "CREATE" });
        return formatResponse({
          type: out.created ? "action" : "error",
          summary: out.created ? "Invoice order created in Square." : String(out.error || "not_created"),
          data: { action: "SQUARE", result: { intent: "SQUARE", ...out } },
          nextActions: [],
          mock: Boolean(out.mock),
          intent: "SQUARE",
        });
      }
      const bundle = await syncEng.getSquareDashboardBundle();
      return formatResponse({
        type: "query",
        summary: "Square financial snapshot.",
        data: { action: "SQUARE", result: { intent: "SQUARE", ...bundle } },
        nextActions: ["Sync Square"],
        mock: Boolean(bundle.squareStatus && bundle.squareStatus.mock),
        intent: "SQUARE",
      });
    } catch (e) {
      return formatResponse({
        type: "error",
        summary: e && e.message ? e.message : "square_error",
        data: { action: "SQUARE", error: e && e.message ? e.message : "error" },
        nextActions: [],
        mock: true,
        intent: "SQUARE",
      });
    }
  }

  if (intent === "SCHEDULE") {
    const { handleScheduleCommand } = require("./weekPlanner");
    try {
      const r = await handleScheduleCommand({ text: input, raw: body });
      return formatResponse({
        type: "action",
        summary: r.summary || "Schedule update.",
        data: {
          action: "SCHEDULE",
          view: r.view,
          weeklyPlan: r.data && r.data.weeklyPlan,
          todayPlan: r.data && r.data.todayPlan,
          blockedJobs: r.data && r.data.blockedJobs,
          outsourcedJobs: r.data && r.data.outsourcedJobs,
          overflowJobs: r.data && r.data.overflowJobs,
          highProfitFirst: r.data && r.data.highProfitFirst,
          deferred: r.data && r.data.deferred,
          capacitySummary: r.data && r.data.capacitySummary,
          assumptions: r.data && r.data.assumptions,
        },
        nextActions: ["Refresh plan tomorrow"],
        mock: Boolean(r.mock),
        intent: "SCHEDULE",
      });
    } catch (e) {
      console.error("[commandPipeline] SCHEDULE failed:", e && e.message ? e.message : e);
      return formatResponse({
        type: "action",
        summary: e && e.message ? e.message : "Schedule failed.",
        data: { action: "SCHEDULE", error: e && e.message ? e.message : "error" },
        nextActions: [],
        mock: true,
        intent: "SCHEDULE",
      });
    }
  }

  if (intent === "WORK_ORDER") {
    const { runWorkOrderFromCommand } = require("./workOrderService");
    try {
      const out = await runWorkOrderFromCommand(input, body);
      if (out.validationError) {
        return formatResponse({
          type: "error",
          summary: "Missing required work order info",
          data: {
            action: "WORK_ORDER",
            missing: out.missing || [],
            jobId: out.jobId,
            route: out.routing && out.routing.route,
            reason: out.routing && out.routing.reason,
          },
          nextActions: (out.missing || []).map((m) => `Provide ${m}`),
          mock: true,
          intent: "WORK_ORDER",
        });
      }

      if (out.routed && (out.route === "IN_HOUSE" || out.route === "DTF")) {
        const r = out.routing || {};
        const label = out.route === "DTF" ? "DTF" : "in-house";
        if (out.success === false) {
          return formatResponse({
            type: "action",
            summary: out.error ? `Routing failed: ${out.error}` : "Could not create production job.",
            data: {
              action: "WORK_ORDER",
              route: out.route,
              reason: r.reason,
              error: out.error,
              jobInput: out.jobInput || null,
            },
            nextActions: ["Retry or create job manually"],
            mock: true,
            intent: "WORK_ORDER",
          });
        }
        return formatResponse({
          type: "action",
          summary: `Routed to ${label} — ${r.reason || "job created"}`,
          data: {
            action: "WORK_ORDER",
            route: out.route,
            reason: r.reason,
            confidence: r.confidence,
            job: out.foundationJob || null,
            jobInput: out.jobInput || null,
            result: {
              route: out.route,
              foundationJob: out.foundationJob,
              mock: out.mock,
              jobId: out.jobId,
            },
          },
          nextActions: [],
          mock: Boolean(out.mock),
          intent: "WORK_ORDER",
        });
      }

      const emailOk = out.email && out.email.success && !out.mock;
      const attachCount = typeof out.attachmentCount === "number" ? out.attachmentCount : 0;
      const rr = out.routing || {};
      return formatResponse({
        type: "action",
        summary: emailOk
          ? `Routed to Bullseye — ${rr.reason || "work order sent"}`
          : `Work order PDF saved${out.mock ? " — email not sent (set BULLSEYE_EMAIL + RESEND_API_KEY)" : ""}.`,
        data: {
          action: "WORK_ORDER",
          route: out.route || "BULLSEYE",
          reason: rr.reason,
          confidence: rr.confidence,
          pdf: out.pdfPath,
          attachments: attachCount,
          jobInput: out.jobInput || null,
          result: {
            pdfPath: out.pdfPath,
            jobId: out.jobId,
            email: out.email,
            mock: out.mock,
            pdfMode: out.pdfMode,
            attachmentCount: attachCount,
            route: out.route,
            routing: out.routing,
          },
        },
        nextActions: emailOk ? [] : ["Configure BULLSEYE_EMAIL and RESEND_API_KEY"],
        mock: Boolean(out.mock),
        intent: "WORK_ORDER",
      });
    } catch (e) {
      console.error("[commandPipeline] WORK_ORDER failed:", e && e.message ? e.message : e);
      return formatResponse({
        type: "action",
        summary: e && e.message ? e.message : "Work order failed.",
        data: { action: "WORK_ORDER", error: e && e.message ? e.message : "error" },
        nextActions: [],
        mock: true,
        intent: "WORK_ORDER",
      });
    }
  }

  if (intent === "SHOP_BOARD") {
    const shop = await buildShopBoardPayload();
    return formatResponse({
      type: "query",
      summary: `Shop: ${shop.counts.ready} ready, ${shop.counts.inProduction} in production, ${shop.counts.blocked} blocked.`,
      data: { shop },
      nextActions: ["Refresh workboard"],
      mock: Boolean(shop.mock),
      intent: "SHOP_BOARD",
    });
  }

  if (intent === "FINANCE_INVOICE") {
    const legacy = await handleCreateInvoice(input, body);
    const inv = legacy.result || {};
    const sum =
      inv.status === "PREVIEW"
        ? inv.message || "Invoice preview — confirm before sending."
        : inv.message || legacy.action || "Invoice action complete.";
    return formatResponse({
      type: "action",
      summary: sum,
      data: { action: "CREATE_INVOICE", result: legacy.result },
      nextActions: inv.status === "PREVIEW" ? ["Confirm invoice in UI or POST confirm:true"] : [],
      mock: Boolean(legacy.mock),
      intent: "FINANCE_INVOICE",
    });
  }

  if (intent === "JOB_CREATE") {
    const legacy = await handleAddJob(input, body);
    const job = legacy.result && legacy.result.job;
    return formatResponse({
      type: "action",
      summary: job ? `Job created: ${job.jobId} — ${job.customer || "customer"}.` : "Job created.",
      data: { action: "ADD_JOB", result: legacy.result },
      nextActions: job ? [`Open job ${job.jobId}`] : [],
      mock: Boolean(legacy.mock),
      intent: "JOB_CREATE",
    });
  }

  if (intent === "JOB_UPDATE") {
    const jobId = String(body.jobId || body.id || "").trim();
    const statusNext = String(body.status || body.nextStatus || "").trim();
    if (!jobId || !statusNext) {
      return formatResponse({
        type: "action",
        summary: "Provide jobId and status in the JSON body to update a job.",
        data: { reason: "missing_fields" },
        nextActions: ["POST /jobs/:id/status with { status }"],
        mock: false,
        intent: "JOB_UPDATE",
      });
    }
    const r = await transitionFoundationJobStatus(jobId, statusNext);
    if (!r.success) {
      return formatResponse({
        type: "action",
        summary: `Could not update job: ${r.reason || "error"}`,
        data: r,
        nextActions: [],
        mock: false,
        intent: "JOB_UPDATE",
      });
    }
    return formatResponse({
      type: "action",
      summary: `Job ${jobId} → ${statusNext}`,
      data: { job: r.job },
      nextActions: [],
      mock: false,
      intent: "JOB_UPDATE",
    });
  }

  const ctx = await buildContext();

  if (intent === "PRODUCTION") {
    const production = buildFullProductionReport(ctx.jobs);
    const readyN = (production.ready || []).length;
    const blockedN = (production.blocked || []).length;
    return formatResponse({
      type: "query",
      summary: `${readyN} job(s) ready to print, ${blockedN} blocked.`,
      data: {
        result: {
          intent: "PRODUCTION",
          answer: `Ready: ${readyN}, blocked: ${blockedN}.`,
          count: readyN,
          jobs: [],
          production: {
            ready: production.ready,
            batches: production.batches,
            tasks: production.tasks,
            blocked: production.blocked,
          },
          queue: production.queue,
          routing: production.routing,
          vendors: production.vendors,
          financials: summarizeJobs(ctx.jobs),
        },
      },
      nextActions: ["What should we print first?", "Show blocked jobs"],
      mock: ctx.mock,
      intent: "PRODUCTION",
    });
  }

  if (intent === "FINANCE") {
    const financials = summarizeJobs(ctx.jobs);
    return formatResponse({
      type: "query",
      summary: `Revenue ${financials.totalRevenue}, profit ${financials.totalProfit}, margin ${financials.marginPercent}%.`,
      data: {
        result: {
          intent: "FINANCE",
          answer: `Revenue ${financials.totalRevenue}, profit ${financials.totalProfit}.`,
          financials,
          jobs: ctx.jobs,
        },
      },
      nextActions: ["Show profit by job", "What is overdue?"],
      mock: ctx.mock,
      intent: "FINANCE",
    });
  }

  if (intent === "ROUTING") {
    const production = buildFullProductionReport(ctx.jobs);
    return formatResponse({
      type: "query",
      summary: `Routing decisions for ${(production.routing || []).length} active route(s).`,
      data: {
        result: {
          intent: "ROUTING",
          answer: "See routing[] and vendors[] for decisions.",
          routing: production.routing,
          vendors: production.vendors,
          queue: production.queue,
        },
      },
      nextActions: ["What goes to Bullseye?"],
      mock: ctx.mock,
      intent: "ROUTING",
    });
  }

  if (intent === "PURCHASING") {
    try {
      const purchaseList = generatePurchaseList(ctx.jobs);
      const legacyInv = checkInventory(purchaseList);
      const plan = await buildPurchasePlan(ctx.jobs);
      const view = getPurchasingView(input);
      const slice = slicePlanForView(view, plan);
      const summary = summarizePurchasingView(view, plan);
      return formatResponse({
        type: "query",
        summary,
        data: {
          action: "PURCHASING",
          view,
          result: {
            intent: "PURCHASING",
            answer: summary,
            purchasing: {
              list: purchaseList,
              inventory: legacyInv,
              purchasePlan: plan,
              ...slice,
            },
          },
        },
        nextActions: ["Build purchase orders", "Show shortages"],
        mock: Boolean(ctx.mock || plan.mock),
        intent: "PURCHASING",
      });
    } catch (e) {
      console.error("[commandPipeline] PURCHASING plan failed:", e && e.message ? e.message : e);
      const purchaseList = generatePurchaseList(ctx.jobs);
      const inventory = checkInventory(purchaseList);
      return formatResponse({
        type: "query",
        summary: "Purchasing (degraded): legacy list only.",
        data: {
          action: "PURCHASING",
          result: {
            intent: "PURCHASING",
            purchasing: { list: purchaseList, inventory, error: e && e.message ? e.message : "plan_error" },
          },
        },
        nextActions: [],
        mock: true,
        intent: "PURCHASING",
      });
    }
  }

  if (intent === "QUERY") {
    const legacy = await handleQuery(input);
    const r = legacy.result || {};
    return formatResponse({
      type: "query",
      summary: r.answer || "OK",
      data: { result: r },
      nextActions: actionsToNext(r.actions),
      mock: Boolean(legacy.mock),
      intent: r.intent || "QUERY",
    });
  }

  const legacy = await handleQuery(input);
  const r = legacy.result || {};
  return formatResponse({
    type: "query",
    summary: r.answer || "Unknown command — try rephrasing.",
    data: { result: r },
    nextActions: actionsToNext(r.actions),
    mock: Boolean(legacy.mock),
    intent: "UNKNOWN",
  });
}

/**
 * Main entry: standardized { type, summary, data, nextActions, mock, intent }
 * Plus legacy-compatible `result` for existing UI layers.
 */
async function runCommandPipeline(body) {
  try {
    const parsed = parseInput(body);
    const intent = detectIntent(parsed.text, parsed);
    console.log("[commandPipeline] intent:", intent, "input:", parsed.text.slice(0, 120));

    const out = await routeIntent(intent, parsed);

    const legacyResult = out.data && out.data.result ? out.data.result : null;
    const merged = {
      success: out.type !== "error",
      type: out.type,
      summary: out.summary,
      data: out.data,
      nextActions: out.nextActions,
      mock: out.mock,
      intent: out.intent,
      reason: out.mock ? "mock_or_degraded" : undefined,
    };

    if (out.intent === "SYSTEM_RUN" && out.data && typeof out.data === "object") {
      Object.assign(merged, out.data);
      merged.result = out.data;
    } else if (legacyResult) {
      merged.result = legacyResult;
    } else if (out.data) {
      merged.result = out.data;
    }

    if (out.data && out.data.action === "CREATE_INVOICE") {
      merged.action = "CREATE_INVOICE";
      merged.result = out.data.result;
    }
    if (out.data && out.data.action === "ADD_JOB") {
      merged.action = "ADD_JOB";
      merged.result = out.data.result;
    }
    if (out.data && out.data.action === "WORK_ORDER") {
      merged.action = "WORK_ORDER";
      merged.result = out.data.result;
    }
    if (out.data && out.data.action === "SCHEDULE") {
      merged.action = "SCHEDULE";
      merged.result = out.data;
      merged.weeklyPlan = out.data.weeklyPlan;
      merged.todayPlan = out.data.todayPlan;
      merged.blockedJobs = out.data.blockedJobs;
      merged.outsourcedJobs = out.data.outsourcedJobs;
      merged.overflowJobs = out.data.overflowJobs;
      merged.capacitySummary = out.data.capacitySummary;
    }
    if (out.data && out.data.action === "PURCHASING") {
      merged.action = "PURCHASING";
      merged.result = out.data.result;
      const pp = out.data.result && out.data.result.purchasing && out.data.result.purchasing.purchasePlan;
      if (pp) {
        merged.purchasePlan = pp;
        merged.shortages = pp.shortages;
        merged.purchaseOrders = pp.purchaseOrders;
        merged.garmentBlockedJobs = pp.garmentBlockedJobs;
        merged.inventorySummary = pp.inventorySummary;
      }
    }
    if (out.data && out.data.action === "VENDOR_OUTBOUND") {
      merged.action = "VENDOR_OUTBOUND";
      merged.result = out.data.result;
    }
    if (out.data && out.data.action === "INTAKE") {
      merged.action = "INTAKE";
      merged.result = out.data.result;
    }
    if (out.data && out.data.action === "SQUARE") {
      merged.action = "SQUARE";
      merged.result = out.data.result;
    }
    if (out.data && out.data.action === "COMMUNICATION") {
      merged.action = "COMMUNICATION";
      merged.result = out.data.result;
    }
    if (out.type === "content" && out.data) {
      merged.type = "content";
      merged.idea = out.data.idea;
      merged.caption = out.data.caption;
      merged.shotList = out.data.shotList;
      merged.post = out.data.post;
      merged.reminder = out.data.reminder;
    }
    if (out.intent === "EXECUTIVE" && out.data && out.data.executive) {
      merged.type = "executive";
      const ex = out.data.executive;
      merged.summary = ex.summary || merged.summary;
      merged.actions = ex.actions || [];
      merged.dailyFocus = ex.dailyFocus || {};
      merged.cashflow = ex.cashflow || {};
      merged.risks = ex.risks || {};
      merged.opportunities = ex.opportunities || {};
      merged.systemHealth = ex.systemHealth;
      merged.assumptions = ex.assumptions;
      merged.partialData = ex.partialData;
      merged.result = ex;
      merged.mock = Boolean(ex.mock);
    }
    if (out.intent === "TEAM" && out.data && out.data.result) {
      const tr = out.data.result;
      merged.type = "status";
      merged.summary = tr.summary || merged.summary;
      merged.data = tr.data !== undefined ? tr.data : merged.data;
      merged.actionsAvailable = tr.actionsAvailable || [];
      merged.result = tr;
    }
    if (out.intent === "SERVICE_DESK" && out.data && out.data.result) {
      const tr = out.data.result;
      if (tr && tr.type === "status") {
        merged.type = "status";
        merged.summary = tr.summary || merged.summary;
        merged.data = tr.data !== undefined ? tr.data : merged.data;
        merged.actionsAvailable = tr.actionsAvailable || [];
        merged.result = tr;
      } else {
        merged.action = "SERVICE_DESK";
        merged.result = tr;
      }
    }
    if (out.intent === "OPERATOR_VIEW" && out.data && out.data.result) {
      const tr = out.data.result;
      if (tr && tr.type === "status") {
        merged.type = "status";
        merged.summary = tr.summary || merged.summary;
        merged.data = tr.data !== undefined ? tr.data : merged.data;
        merged.actionsAvailable = tr.actionsAvailable || [];
        merged.result = tr;
      } else {
        merged.action = "OPERATOR_VIEW";
        merged.result = tr;
      }
    }
    if (/^AUTOMATION_/.test(String(out.intent || "")) && out.data) {
      merged.action = "AUTOMATION";
      merged.result = out.data.result !== undefined ? out.data.result : out.data;
    }
    if (/^ADOPTION_/.test(String(out.intent || "")) && out.data) {
      merged.action = "ADOPTION";
      merged.result = out.data.result !== undefined ? out.data.result : out.data;
    }
    if (/^OPS_/.test(String(out.intent || "")) && out.data) {
      merged.action = "OPS_INBOUND";
      merged.result = out.data.result !== undefined ? out.data.result : out.data;
    }
    if (/^GOLIVE_/.test(String(out.intent || "")) && out.data) {
      merged.action = "GOLIVE";
      merged.result = out.data.result !== undefined ? out.data.result : out.data;
    }

    return merged;
  } catch (error) {
    console.error("[commandPipeline] error:", error && error.message ? error.message : error);
    return {
      success: false,
      type: "query",
      summary: error && error.message ? error.message : "Command failed.",
      data: { error: error && error.message ? error.message : "error" },
      nextActions: [],
      mock: true,
      intent: "ERROR",
      result: { answer: "Command error.", intent: "ERROR" },
    };
  }
}

module.exports = {
  runCommandPipeline,
  parseInput,
  detectIntent,
  formatResponse,
};
