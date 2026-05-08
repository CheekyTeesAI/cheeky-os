"use strict";

/**
 * CHEEKY OS v4.3 — Normalize snapshot for dashboards + Prometheus.
 */

const path = require("path");

function integrationCards() {
  let dvConfigured = !!(process.env.DATAVERSE_URL && process.env.DATAVERSE_CLIENT_SECRET);
  try {
    const dv = require(path.join(__dirname, "..", "data", "dataverse-store"));
    if (typeof dv.isConfigured === "function") dvConfigured = dv.isConfigured();
  } catch (_) {}
  const square = !!(process.env.SQUARE_ACCESS_TOKEN && process.env.SQUARE_ACCESS_TOKEN !== "REPLACE_ME");
  const openai = !!String(process.env.OPENAI_API_KEY || "").trim();
  const profile = String(process.env.CHEEKY_DATAVERSE_PROFILE || "").trim() || "default";
  return [
    {
      key: "dataverse",
      label: "Dataverse",
      ok: dvConfigured,
      detail: dvConfigured ? `profile=${profile}` : "DATAVERSE_* incomplete",
    },
    {
      key: "square",
      label: "Square",
      ok: square,
      detail: square ? "token configured" : "SQUARE_ACCESS_TOKEN missing or placeholder",
    },
    {
      key: "openai",
      label: "OpenAI",
      ok: openai,
      detail: openai ? "API key present" : "OPENAI_API_KEY unset (brain steps skip)",
    },
    {
      key: "worker",
      label: "Autonomous worker",
      ok: true,
      detail: "see observability.worker",
    },
  ];
}

function buildDashboardPayload() {
  let snap = {};
  try {
    snap = require("./cheekyOsRuntimeObservability.service").getObservabilitySnapshot();
  } catch (_) {}
  const {
    cheekyOsVersion,
    listenPort,
    resolveDataverseProfileLabel,
  } = require("./cheekyOsRuntimeConfig.service");
  return {
    generatedAt: new Date().toISOString(),
    version: cheekyOsVersion(),
    port: listenPort(),
    dataverseProfile: resolveDataverseProfileLabel(),
    observability: snap,
    integrations: integrationCards(),
  };
}

function buildDetailedHealthReport() {
  const dvStorePath = path.join(__dirname, "..", "data", "dataverse-store");
  const dv = require(dvStorePath);
  const base = buildDashboardPayload();
  const w = base.observability?.worker || {};
  const healthy =
    !w.enabled ||
    (!!(w.running && !(w.breakerOpenUntil && Date.now() < w.breakerOpenUntil)) &&
      !String(w.lastLoopError || "").includes("dataverse_not_configured"));
  const checks = [
    {
      name: "dataverse_credentials",
      ok: typeof dv.isConfigured === "function" ? dv.isConfigured() : false,
      detail:
        typeof dv.effectiveDataverseSummary === "function" ? dv.effectiveDataverseSummary() : null,
    },
    {
      name: "worker_loop",
      ok: healthy,
      detail: { running: !!w.running, enabled: !!w.enabled, polls: w.polls },
    },
    {
      name: "intake_tail",
      ok: true,
      detail: base.observability?.intake?.lastAt ? "recent" : "none",
    },
  ];
  return {
    ok: checks.every((c) => c.ok),
    time: base.generatedAt,
    version: base.version,
    profile: base.dataverseProfile,
    checks,
    observability: base.observability,
    integrations: base.integrations,
  };
}

module.exports = {
  buildDashboardPayload,
  buildDetailedHealthReport,
};
