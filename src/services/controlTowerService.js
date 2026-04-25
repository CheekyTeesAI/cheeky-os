/**
 * Aggregates existing services — no duplicate business logic.
 */
const { getSystemHealthReport } = require("./systemEngine");
const { buildShopBoardPayload } = require("./shopBoardService");
const { buildServiceDeskDashboardBundle } = require("./serviceDeskBundle");
const { listServiceDeskItems } = require("./serviceDeskService");
const { listPendingApprovals } = require("./approvalEngine");
const { listCommunications } = require("./communicationService");
const { getOutboundDashboardSlice } = require("./vendorOutboundEngine");
const { getOperatingSystemJobs } = require("./foundationJobMerge");
const { generatePurchaseList } = require("./purchasingEngine");
const { summarizeJobs } = require("./financeEngine");
const { getInvoices } = require("./squareDataService");
const { normalizeInvoicesToJobs } = require("./jobNormalizer");
const { upsertJobs } = require("../data/store");
const { getTodayContent } = require("./contentOrchestrator");
const { getFirstRunStatus } = require("./firstRunService");
const { buildSetupChecklist } = require("./setupWizardService");
const { getDemoDataStatus } = require("./demoDataService");
const { getTrainingModeStatus } = require("./trainingModeService");
const { getWorkflowGuides } = require("./guidedWorkflowService");
const { getHelpContent } = require("./helpContentService");
const { listRecentEmailsSince } = require("./emailInboxService");
const { getArtReviewQueue, getPrintReadyArt } = require("./artQueueService");
const { getRecentTimeline } = require("./timelineService");
const { listSmsSince, listCallsSince } = require("./phoneOpsService");
const { buildGoLiveReadinessReport } = require("./goLiveReadinessService");
const { getOperationalContextAsync } = require("./operationalContext");

function safe(fn, fallback) {
  try {
    return fn();
  } catch (_e) {
    return fallback;
  }
}

function compactJobCard(j) {
  if (!j) return null;
  return {
    jobId: j.jobId,
    customer: j.customer,
    dueDate: j.dueDate,
    status: j.status,
    shopStatus: j.shopStatus,
  };
}

function buildAlerts({ systemHealth, deploy, serviceDesk, commFailed, money }) {
  const alerts = [];
  if (deploy && deploy.critical && deploy.critical.length) {
    alerts.push({ level: "critical", source: "deploy", message: deploy.critical[0] });
  }
  if (systemHealth && String(systemHealth.status || "").toUpperCase() === "RED") {
    alerts.push({ level: "critical", source: "system", message: "System health RED" });
  }
  const esc = serviceDesk && serviceDesk.summary && serviceDesk.summary.escalatedCount;
  if (esc > 0) {
    alerts.push({ level: "critical", source: "serviceDesk", message: `${esc} escalated service item(s)` });
  }
  if (commFailed && commFailed.length) {
    alerts.push({
      level: "critical",
      source: "communications",
      message: `${commFailed.length} failed communication(s)`,
    });
  }
  if (money && Number(money.overdueRevenue || 0) > 0) {
    alerts.push({
      level: "critical",
      source: "money",
      message: `Overdue revenue ~$${Number(money.overdueRevenue).toFixed(0)}`,
    });
  }
  return alerts.slice(0, 12);
}

/**
 * @param {import("express").Application | null} app
 */
async function buildControlTowerPayload(app) {
  const systemHealth = safe(() => getSystemHealthReport(app || null), { status: "UNKNOWN" });
  const deploy = global.__CHEEKY_STARTUP_VALIDATION__ || null;

  let automation = null;
  safe(() => {
    const automationRunner = require("./automationRunner");
    const st = automationRunner.loadState();
    automation = {
      paused: !!st.paused,
      dryRun: !!(automationRunner.getAutomationConfig && automationRunner.getAutomationConfig().dryRun),
    };
  }, null);

  let controlState = null;
  safe(() => {
    controlState = require("./systemControlService").getSystemState();
  }, null);

  const production = await (async () => {
    try {
      const p = await buildShopBoardPayload();
      return {
        counts: p.counts || {},
        mock: p.mock,
        columns: {
          ready: (p.columns && p.columns.ready ? p.columns.ready : []).slice(0, 8).map(compactJobCard),
          inProduction: (p.columns && p.columns.inProduction ? p.columns.inProduction : []).slice(0, 8).map(compactJobCard),
          blocked: (p.columns && p.columns.blocked ? p.columns.blocked : []).slice(0, 8).map(compactJobCard),
          completed: (p.columns && p.columns.completed ? p.columns.completed : []).slice(0, 6).map(compactJobCard),
        },
      };
    } catch (e) {
      return { error: e && e.message ? e.message : "production_unavailable" };
    }
  })();

  const sdBundle = safe(() => buildServiceDeskDashboardBundle(), {});
  const escalated = safe(() => listServiceDeskItems({ state: "ESCALATED", limit: 12 }), []);
  const waitingTeam = safe(() => listServiceDeskItems({ state: "WAITING_TEAM", limit: 12 }), []);
  const waitingCustomer = safe(() => listServiceDeskItems({ state: "WAITING_CUSTOMER", limit: 12 }), []);

  const serviceDesk = {
    summary: sdBundle.serviceDeskSummary || null,
    escalated: escalated.map((i) => ({
      id: i.id,
      state: i.state,
      summary: (i.summary || "").slice(0, 120),
      relatedType: i.relatedType,
      relatedId: i.relatedId,
    })),
    waitingTeam: waitingTeam.map((i) => ({
      id: i.id,
      summary: (i.summary || "").slice(0, 100),
      relatedId: i.relatedId,
    })),
    waitingCustomer: waitingCustomer.map((i) => ({
      id: i.id,
      summary: (i.summary || "").slice(0, 100),
      relatedId: i.relatedId,
    })),
  };

  const pendingComms = safe(() => listCommunications({ status: "PENDING_APPROVAL", limit: 20 }), []);
  const failedComms = safe(() => listCommunications({ status: "FAILED", limit: 8 }), []);
  const vendorDash = safe(() => getOutboundDashboardSlice(), { pendingApprovals: [] });
  const genericApprovals = safe(() => listPendingApprovals(), []);

  const approvals = {
    communications: pendingComms.map((c) => ({
      id: c.id,
      templateKey: c.templateKey,
      relatedType: c.relatedType,
      relatedId: c.relatedId,
      subject: (c.subject || "").slice(0, 80),
    })),
    purchaseOrders: (vendorDash.pendingApprovals || []).slice(0, 15).map((p) => ({
      approvalId: p.id || p.approvalId,
      poNumber: p.payload && p.payload.poNumber,
      status: p.status || "PENDING",
    })),
    other: genericApprovals.slice(0, 12).map((a) => ({
      id: a.id,
      type: a.type,
      status: a.status,
    })),
  };

  const purchasing = await (async () => {
    try {
      const jobs = await getOperatingSystemJobs();
      const pl = generatePurchaseList(jobs);
      const totalUnits = pl.reduce((s, x) => s + Number(x.total || 0), 0);
      return {
        lineCount: pl.length,
        totalUnits,
        topLines: pl.slice(0, 8).map((x) => ({
          garment: x.garment,
          product: x.product,
          total: x.total,
          jobs: (x.jobs || []).slice(0, 3),
        })),
      };
    } catch (e) {
      return { error: e && e.message ? e.message : "purchasing_unavailable" };
    }
  })();

  const money = await (async () => {
    try {
      const { invoices, mock } = await getInvoices();
      upsertJobs(normalizeInvoicesToJobs(invoices));
      const jobs = await getOperatingSystemJobs();
      const s = summarizeJobs(jobs);
      const unpaidJobs = (s.perJob || []).filter((r) => String(r.status || "").toUpperCase() !== "PAID").length;
      const depositsNeeded = (s.perJob || []).filter((r) =>
        /UNPAID|PARTIAL|DEPOSIT|BALANCE/i.test(String(r.status || ""))
      ).length;
      return {
        mock: Boolean(mock),
        totalRevenue: s.totalRevenue,
        openRevenue: s.openRevenue,
        overdueRevenue: s.overdueRevenue,
        unpaidJobs,
        depositsNeeded,
      };
    } catch (e) {
      return { error: e && e.message ? e.message : "finance_unavailable" };
    }
  })();

  let content = null;
  safe(() => {
    const { post, record } = getTodayContent();
    content = {
      postId: record && record.id,
      status: record && record.status,
      idea: post && post.idea,
      hook: post && post.hook,
      postType: post && post.postType,
    };
  }, null);

  const alerts = buildAlerts({
    systemHealth,
    deploy,
    serviceDesk: { summary: sdBundle.serviceDeskSummary },
    commFailed: failedComms,
    money,
  });

  let adoption = null;
  try {
    const firstRun = await getFirstRunStatus();
    const training = getTrainingModeStatus();
    const demo = getDemoDataStatus();
    const checklist = buildSetupChecklist();
    const showSetupCards =
      firstRun.isFirstRun || training.enabled || demo.seeded || firstRun.hasDemoData;
    adoption = {
      showSetupCards,
      firstRun,
      training,
      demo,
      checklistSummary: {
        completed: (checklist.completedKeys || []).length,
        total: (checklist.steps || []).length,
      },
      quickStart: {
        owner: getWorkflowGuides("OWNER").guide.slice(0, 2),
        printer: getWorkflowGuides("PRINTER").guide.slice(0, 2),
        admin: getWorkflowGuides("ADMIN").guide.slice(0, 2),
      },
      help: {
        controlTower: getHelpContent("control-tower"),
        commandConsole: getHelpContent("command-console"),
      },
      links: {
        setupStatus: "/setup/status",
        setupChecklist: "/setup/checklist",
        setupRun: "POST /setup/run",
        demoSeed: "POST /setup/demo/seed",
        demoClear: "POST /setup/demo/clear",
        training: "/setup/training",
        guides: "/setup/guides/OWNER",
        help: "/help/control-tower",
      },
    };
  } catch (_e) {
    adoption = { error: "adoption_unavailable" };
  }

  let opsInbound = null;
  try {
    const dayStart = `${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`;
    const emailsToday = listRecentEmailsSince(dayStart);
    const smsToday = listSmsSince(dayStart);
    const callsToday = listCallsSince(dayStart);
    opsInbound = {
      degraded: !process.env.TWILIO_ACCOUNT_SID,
      todayCounts: {
        emailsIngested: emailsToday.length,
        sms: smsToday.length,
        calls: callsToday.length,
      },
      artQueueCount: getArtReviewQueue().length,
      printReadyArtCount: getPrintReadyArt().length,
      recentTimeline: getRecentTimeline({ since: dayStart, limit: 12 }),
      links: {
        inboundEmail: "POST /inbound/email",
        inboundSms: "POST /inbound/sms",
        timelineRecent: "/timeline/recent",
        artQueue: "/art/queue",
        artPrintReady: "/art/print-ready",
        notes: "POST /notes",
      },
    };
  } catch (_e) {
    opsInbound = { error: "ops_inbound_unavailable" };
  }

  let operationalContext = null;
  let goLive = null;
  try {
    operationalContext = await getOperationalContextAsync();
    const r = await buildGoLiveReadinessReport(app);
    goLive = {
      globalMode: r.modes && r.modes.globalMode,
      ready: r.ready,
      score: r.score,
      blockers: (r.blockers || []).slice(0, 8),
      warnings: (r.warnings || []).slice(0, 10),
      links: {
        status: "/go-live/status",
        providers: "/go-live/providers",
        readiness: "/go-live/readiness",
        preview: "POST /go-live/preview",
        cutover: "POST /go-live/cutover",
      },
    };
  } catch (_e) {
    goLive = { error: "go_live_unavailable" };
  }

  return {
    systemHealth: {
      ...systemHealth,
      deploy,
      automation,
      controlState,
    },
    production,
    serviceDesk,
    approvals,
    purchasing,
    money,
    content,
    alerts,
    adoption,
    opsInbound,
    operationalContext,
    goLive,
    links: {
      shopBoard: "/shop/board",
      serviceDesk: "/service-desk",
      communicationsPending: "/communications/pending",
      vendorPending: "/vendor/outbound/pending",
      financeSummary: "/finance/summary",
      purchasingList: "/purchasing/list",
      contentToday: "/content/today",
      command: "/command",
    },
  };
}

module.exports = {
  buildControlTowerPayload,
};
