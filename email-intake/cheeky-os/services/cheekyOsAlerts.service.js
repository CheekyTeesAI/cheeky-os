"use strict";

/**
 * CHEEKY OS v4.1 — Lightweight alerting (worker failure / error bursts).
 *
 * CHEEKY_ALERT_ENABLED=true
 * CHEEKY_ALERT_SLACK_WEBHOOK_URL=https://hooks.slack.com/...
 * CHEEKY_ALERT_EMAIL_TO=you@corp.com — uses Resend if RESEND_API_KEY set (optional)
 * CHEEKY_ALERT_COOLDOWN_MS=3600000
 * CHEEKY_ALERT_POLL_MS=60000
 */

const { logStructured } = require("./cheekyOsStructuredLog.service");

let _lastFire = 0;
let _started = false;
let _timer = null;

function cooldownMs() {
  let n = parseInt(String(process.env.CHEEKY_ALERT_COOLDOWN_MS || "3600000"), 10);
  if (!Number.isFinite(n)) n = 3600000;
  return Math.max(60000, Math.min(n, 86400000));
}

function alertsEnabled() {
  return String(process.env.CHEEKY_ALERT_ENABLED || "").match(/^(1|true|on|yes)$/i);
}

async function postSlack(text) {
  const url = String(process.env.CHEEKY_ALERT_SLACK_WEBHOOK_URL || "").trim();
  if (!url) return { ok: false, reason: "no_slack_url" };
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  }).catch(() => null);
  return { ok: !!(r && r.ok) };
}

async function maybeEmail(subject, text) {
  const to = String(process.env.CHEEKY_ALERT_EMAIL_TO || "").trim();
  const key = String(process.env.RESEND_API_KEY || "").trim();
  if (!to || !key) return { ok: false, reason: "no_email_transport" };
  try {
    const { Resend } = require("resend");
    const resend = new Resend(key);
    const from = String(process.env.RESEND_FROM || "noreply@cheeky.local").trim() || "Cheeky <onboarding@resend.dev>";
    await resend.emails.send({ from, to: [to], subject, text });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e && e.message ? e.message : String(e) };
  }
}

function fireDeduped(summary) {
  const now = Date.now();
  if (now - _lastFire < cooldownMs()) return;
  _lastFire = now;

  logStructured("alert_fire", { summary });

  return Promise.all([postSlack(summary), maybeEmail("[Cheeky OS] Operator alert", summary)]).catch(
    () => {}
  );
}

function evaluateAlerts() {
  if (!alertsEnabled()) return;
  let snap;
  try {
    snap = require("./cheekyOsRuntimeObservability.service").getObservabilitySnapshot();
  } catch (_) {
    return;
  }
  const w = snap.worker || {};
  const failRatio =
    (w.ticksOk || 0) + (w.ticksFailed || 0) > 8
      ? (w.ticksFailed || 0) / Math.max(1, (w.ticksOk || 0) + (w.ticksFailed || 0))
      : 0;

  const breakerOpen = !!(w.breakerOpenUntil && Date.now() < w.breakerOpenUntil);
  const badWorker = w.enabled && (!w.running || breakerOpen || (w.lastLoopError && failRatio > 0.55));

  const odataBurst = Number(snap.resiliency?.odataFailuresObserved || 0) > 25;

  if (badWorker) {
    const why = breakerOpen ? "circuit_breaker_open" : !w.running ? "worker_not_running" : "high_poll_fail_ratio";
    void fireDeduped(
      `⚠️ Cheeky OS operator worker issue (${why})\nPolls=${w.polls ?? 0} ok=${w.ticksOk ?? 0} fail=${
        w.ticksFailed ?? 0
      }\nlastError=${String(w.lastLoopError || "").slice(0, 420)}`
    );
  }

  if (odataBurst && !badWorker) {
    void fireDeduped(`⚠️ Cheeky OS Dataverse OData failures elevated (count=${snap.resiliency.odataFailuresObserved})`);
  }
}

function startCheekyOsAlertTicker() {
  if (_started) return;
  _started = true;
  if (!alertsEnabled()) {
    console.log("[alert-ticker v4.1] disabled (CHEEKY_ALERT_ENABLED not true)");
    return;
  }
  let n = parseInt(String(process.env.CHEEKY_ALERT_POLL_MS || "60000"), 10);
  if (!Number.isFinite(n)) n = 60000;
  n = Math.max(15000, Math.min(n, 600000));

  evaluateAlerts();
  _timer = setInterval(() => {
    evaluateAlerts();
  }, n);
  _timer.unref?.();
  console.log(`[alert-ticker v4.1] polling every ${n}ms`);
}

module.exports = { startCheekyOsAlertTicker, evaluateAlerts, fireDeduped };
