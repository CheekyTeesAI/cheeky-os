/**
 * Subsystem readiness matrix — no secrets.
 */
const { listRegisteredRoutes } = require("./systemEngine");
const {
  testSquareRead,
  testSquareWritePreview,
  testEmailProvider,
  testSMSProvider,
  testStorageAccess,
  testVendorConfig,
  testDatabasePersistence,
} = require("./providerConnectivityService");

function routeMounted(app, pathFragment) {
  if (!app) return false;
  try {
    const routes = listRegisteredRoutes(app);
    const frag = String(pathFragment || "").toLowerCase();
    return routes.some((r) => String(r).toLowerCase().includes(frag));
  } catch (_e) {
    return false;
  }
}

function mk(subsystem, partial) {
  return {
    subsystem,
    configured: Boolean(partial.configured),
    reachable: Boolean(partial.reachable),
    mode: partial.mode || "UNKNOWN",
    blocking: Boolean(partial.blocking),
    warnings: Array.isArray(partial.warnings) ? partial.warnings : [],
    checks: Array.isArray(partial.checks) ? partial.checks : [],
  };
}

/**
 * @param {import("express").Application | null} app
 */
async function validateLiveIntegrations(app) {
  const sr = await testSquareRead();
  const sw = await testSquareWritePreview();
  const em = await testEmailProvider();
  const sms = await testSMSProvider();
  const st = await testStorageAccess();
  const vn = await testVendorConfig();
  const db = await testDatabasePersistence();

  const inboundEmail = !!String(process.env.POWER_AUTOMATE_OUTLOOK_WEBHOOK || "").trim() ||
    !!String(process.env.MSGRAPH_ACCESS_TOKEN || "").trim();
  const routesOk = app
    ? routeMounted(app, "/go-live") && routeMounted(app, "/control-tower") && routeMounted(app, "/command")
    : false;

  let automation = { mode: "UNKNOWN", paused: false, dryRun: false };
  try {
    const ar = require("./automationRunner");
    const s = ar.loadState();
    const cfg = ar.getAutomationConfig ? ar.getAutomationConfig() : {};
    automation = { paused: !!s.paused, dryRun: !!cfg.dryRun, mode: s.paused ? "PAUSED" : cfg.dryRun ? "DRY_RUN" : "RUNNING" };
  } catch (_e) {
    automation = { mode: "UNAVAILABLE", paused: true };
  }

  const subsystems = [
    mk("square_read", {
      configured: !!process.env.SQUARE_ACCESS_TOKEN,
      reachable: sr.ok && !sr.mock,
      mode: sr.mock ? "MOCK" : "LIVE",
      blocking: sr.mock,
      warnings: sr.mock ? ["Invoice data may be mock until Square token works."] : [],
      checks: [{ name: "fetch_invoices", ok: !sr.mock, detail: sr.reason }],
    }),
    mk("square_write", {
      configured: sw.writeCapable === true,
      reachable: sw.ok,
      mode: sw.mode === "LIVE_CAPABLE" ? "LIVE" : sw.mode === "DEGRADED" ? "DEGRADED" : "MOCK",
      blocking: false,
      warnings: !sw.writeCapable ? ["Draft invoice APIs may be limited without location + token."] : [],
      checks: [{ name: "credentials", ok: sw.ok }],
    }),
    mk("inbound_email", {
      configured: inboundEmail,
      reachable: inboundEmail,
      mode: inboundEmail ? "LIVE_CAPABLE" : "DEGRADED",
      blocking: false,
      warnings: inboundEmail ? [] : ["Inbound email pipeline relies on manual POST /inbound/email until Graph/webhook live."],
      checks: [{ name: "webhook_or_graph", ok: inboundEmail }],
    }),
    mk("outbound_email", {
      configured: em.ok,
      reachable: em.ok,
      mode: em.mode,
      blocking: !em.ok,
      warnings: !em.ok ? ["Customer comms need Resend or email API key."] : [],
      checks: [{ name: "resend_key", ok: em.ok }],
    }),
    mk("sms", {
      configured: sms.ok,
      reachable: sms.ok,
      mode: sms.mode,
      blocking: false,
      warnings: !sms.ok ? ["SMS degraded — use email/manual."] : [],
      checks: [{ name: "twilio_env", ok: sms.ok }],
    }),
    mk("storage", {
      configured: st.ok,
      reachable: st.ok,
      mode: st.mode,
      blocking: !st.ok,
      warnings: !st.ok ? ["data/ or uploads/ not writable."] : [],
      checks: st.checks || [],
    }),
    mk("vendor_outbound", {
      configured: vn.ok,
      reachable: vn.ok,
      mode: vn.mode,
      blocking: false,
      warnings: !vn.ok ? ["Vendor PO email not fully configured."] : [],
      checks: [{ name: "vendor_emails", ok: vn.ok, count: vn.vendorsWithEmail }],
    }),
    mk("database", {
      configured: db.ok,
      reachable: db.ok,
      mode: db.mode,
      blocking: !db.ok,
      warnings: !db.ok ? ["Foundation DB unavailable — some jobs/art paths may be file-only."] : [],
      checks: [{ name: "prisma_ping", ok: db.ok, detail: db.reason }],
    }),
    mk("operator_console_routes", {
      configured: true,
      reachable: app ? routeMounted(app, "/operator") || routeMounted(app, "/api/operator") : false,
      mode: app && (routeMounted(app, "/operator") || routeMounted(app, "/api/operator")) ? "LIVE" : "DEGRADED",
      blocking: false,
      warnings: [],
      checks: [{ name: "operator_mounted", ok: app && (routeMounted(app, "/operator") || routeMounted(app, "/api/operator")) }],
    }),
    mk("control_tower_routes", {
      configured: true,
      reachable: app ? routeMounted(app, "/control-tower") : false,
      mode: app && routeMounted(app, "/control-tower") ? "LIVE" : "DEGRADED",
      blocking: false,
      warnings: !app ? ["App instance not passed — route presence unknown."] : [],
      checks: [{ name: "mounted", ok: app && routeMounted(app, "/control-tower") }],
    }),
    mk("automation_runner", {
      configured: true,
      reachable: automation.mode !== "UNAVAILABLE",
      mode: automation.mode,
      blocking: false,
      warnings:
        automation.dryRun ? ["Automation dry-run enabled."] : automation.paused ? ["Automation paused."] : [],
      checks: [{ name: "state", ok: true, detail: automation }],
    }),
  ];

  return { time: new Date().toISOString(), subsystems, routesProbe: routesOk };
}

module.exports = { validateLiveIntegrations };
