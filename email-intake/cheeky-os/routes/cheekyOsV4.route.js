"use strict";

/**
 * CHEEKY OS v4.3 — Dashboard, metrics, admin, audit-aware routes (+ Power Apps tile feed).
 */

const express = require("express");
const rateLimit = require("express-rate-limit");
const { listenPort, cheekyOsVersion } = require("../services/cheekyOsRuntimeConfig.service");
const { dashboardApiKey } = require("../services/cheekyOsRuntimeConfig.service");
const { prometheusLinesFromSnap } = require("../services/cheekyOsPrometheus.service");
const { requireDashboardAuth, clientIp, extractApiKey, authRequired } = require("../services/cheekyOsDashboardAuth.service");
const { recordAdminAudit } = require("../services/cheekyOsAdminAudit.service");
const { logStructured } = require("../services/cheekyOsStructuredLog.service");
const { buildDashboardPayload, buildDetailedHealthReport } = require("../services/cheekyOsDashboardData.service");
const dashboardSummaryService = require("../services/dashboardSummaryService");

const ADMIN_HEADER = "x-cheeky-admin-key";

function getAdminKeyFromRequest(req) {
  const hdr = req.get ? req.get(ADMIN_HEADER) : req.headers?.[ADMIN_HEADER];
  const b = hdr != null ? String(hdr).trim() : "";
  if (b) return b;
  return String(process.env.CHEEKY_ADMIN_API_KEY || "").trim();
}

function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const router = express.Router();

const v41Limiter = rateLimit({
  windowMs: Number(process.env.CHEEKY_V41_RL_WINDOW_MS || 60000) || 60000,
  limit: Number(process.env.CHEEKY_V41_RL_MAX || 400) || 400,
  standardHeaders: true,
  legacyHeaders: false,
});

router.use(v41Limiter);

function metricsProtect(req, res, next) {
  if (!String(process.env.CHEEKY_METRICS_REQUIRE_AUTH || "").match(/^(1|true|on|yes)$/i)) {
    return next();
  }
  return requireDashboardAuth(req, res, next);
}

router.get("/metrics", metricsProtect, (req, res, next) => {
  try {
    const snap = require("../services/cheekyOsRuntimeObservability.service").getObservabilitySnapshot();
    const fmt = String(req.query.format || "").toLowerCase();
    const accept = String(req.get("accept") || "").toLowerCase();
    const wantJson =
      fmt === "json" || accept.includes("application/json") || accept.includes("text/json");
    if (wantJson) {
      const text = prometheusLinesFromSnap(snap);
      res.json({
        ok: true,
        observability: snap,
        prometheus_text: text,
      });
      return;
    }
    res.type("text/plain; charset=utf-8").send(prometheusLinesFromSnap(snap));
  } catch (e) {
    next(e);
  }
});

router.get("/api/cheeky-os/dashboard-data", async (req, res) => {
  const base = buildDashboardPayload();
  const tilesSvc = require("../services/cheekyOsPowerAppsTiles.service");
  const expectedKey = dashboardApiKey() || String(process.env.CHEEKY_ADMIN_API_KEY || "").trim();
  const providedKey = extractApiKey(req);
  const authMismatch = authRequired() && expectedKey && providedKey !== expectedKey;
  if (authMismatch) {
    const cached = dashboardSummaryService.readLastGood();
    const payload = cached && cached.payload ? cached.payload : null;
    console.warn("[POWERAPPS][DEGRADED] dashboard auth mismatch, using cached summary");
    const dFlat = dashboardSummaryService.ensureFlatSummaryData(payload ? payload.data : null);
    const cachedTiles = payload
      ? tilesSvc.finalizeTileObject({
          Source: "partial",
          OrdersOnHold: dFlat.ordersOnHold,
          OrdersWaitingOnArt: dFlat.artWaiting,
          Estimates: dFlat.estimates,
          BlanksNeeded: dFlat.blanksNeeded,
          OrdersNeedingArt: dFlat.ordersNeedingArt,
          QueueDepth: 0,
          LastIntakeTime: null,
          WorkerStatus: "Degraded",
          ActiveJobs: dFlat.production,
          TotalOrdersToday: dFlat.totalOrdersToday,
          GeneratedAt: nowIsoSafe(),
          Notes: ["auth_mismatch_cached_mode"],
        })
      : tilesSvc.emptyPowerAppsTiles(base.observability, {
          Source: "partial",
          Error: "auth_mismatch_no_cache",
        });
    const attentionTileSum =
      (Number(cachedTiles.OrdersOnHold) || 0) +
      (Number(cachedTiles.OrdersWaitingOnArt) || 0) +
      (Number(cachedTiles.BlanksNeeded) || 0) +
      (Number(cachedTiles.OrdersNeedingArt) || 0);
    const summaryBlock = {
      headline: "Dashboard auth degraded. Showing cached operational data.",
      tileSource: cachedTiles.Source,
      metricsMode: "partial",
      workerStatus: cachedTiles.WorkerStatus,
      queueDepth: cachedTiles.QueueDepth,
      activeProductionJobs: cachedTiles.ActiveJobs,
      ordersCreatedToday: cachedTiles.TotalOrdersToday,
      lastIntakeTime: cachedTiles.LastIntakeTime,
      attentionTileSum,
    };
    return res.status(200).json({
      success: true,
      degradedMode: true,
      warnings: ["auth_mismatch_cached_mode"],
      data: {
        summary: summaryBlock,
        tiles: cachedTiles,
        version: base.version,
        port: base.port,
        dataverseProfile: base.dataverseProfile,
        observability: base.observability,
        integrations: base.integrations,
      },
      legacy: {
        ok: true,
        status: "degraded",
        release: "4.3 Production Ready",
        summary: summaryBlock,
        powerAppsTestHint: "Check X-Cheeky-Dashboard-Key and connector settings",
        generatedAt: nowIsoSafe(),
        version: base.version,
        port: base.port,
        dataverseProfile: base.dataverseProfile,
        observability: base.observability,
        integrations: base.integrations,
        tiles: cachedTiles,
      },
      ok: true,
      status: "degraded",
      release: "4.3 Production Ready",
      summary: summaryBlock,
      powerAppsTestHint: "Check X-Cheeky-Dashboard-Key and connector settings",
      generatedAt: nowIsoSafe(),
      version: base.version,
      port: base.port,
      dataverseProfile: base.dataverseProfile,
      observability: base.observability,
      integrations: base.integrations,
      tiles: cachedTiles,
    });
  }
  let tiles;
  try {
    tiles = await tilesSvc.loadPowerAppsTiles({ observability: base.observability });
  } catch (e) {
    const msg = e && e.message ? String(e.message) : String(e);
    tiles = tilesSvc.emptyPowerAppsTiles(base.observability, { Source: "error", Error: msg });
  }

  const degraded =
    tiles.Source === "partial" ||
    tiles.Source === "database_unavailable" ||
    tiles.Source === "error" ||
    (Array.isArray(tiles.Notes) && tiles.Notes.length > 0);

  const status = degraded ? "degraded" : "success";

  const attentionTileSum =
    (Number(tiles.OrdersOnHold) || 0) +
    (Number(tiles.OrdersWaitingOnArt) || 0) +
    (Number(tiles.BlanksNeeded) || 0) +
    (Number(tiles.OrdersNeedingArt) || 0);

  const summary = {
    headline:
      status === "success"
        ? "Tiles and observability nominal"
        : "Partial metrics — some counters may be zero; see tiles.Notes and tiles.HealthSummary",
    tileSource: tiles.Source,
    metricsMode: degraded ? "partial" : "full",
    workerStatus: tiles.WorkerStatus,
    queueDepth: tiles.QueueDepth,
    activeProductionJobs: tiles.ActiveJobs,
    ordersCreatedToday: tiles.TotalOrdersToday,
    lastIntakeTime: tiles.LastIntakeTime,
    attentionTileSum,
  };

  const port = listenPort();
  const hostHdr = String(req.get("host") || "").trim();
  const host = hostHdr || `127.0.0.1:${port}`;
  const xfProto = String(req.get("x-forwarded-proto") || "").trim().toLowerCase();
  const proto =
    xfProto ||
    (typeof req.protocol === "string" && req.protocol ? String(req.protocol).replace(/:$/, "") : "http");

  const powerAppsTestHint = `curl -sS -H "X-Cheeky-Dashboard-Key: YOUR_KEY" "${proto}://${host}/api/cheeky-os/dashboard-data"`;

  const legacyBody = {
    ok: true,
    status,
    release: "4.3 Production Ready",
    summary,
    powerAppsTestHint,
    ...base,
    tiles,
  };

  res.json({
    success: status === "success",
    degradedMode: degraded,
    warnings: [],
    data: {
      summary,
      tiles,
      attentionTileSum,
      version: base.version,
      port: base.port,
      dataverseProfile: base.dataverseProfile,
      observability: base.observability,
      integrations: base.integrations,
    },
    legacy: legacyBody,
    ...legacyBody,
  });
});

function nowIsoSafe() {
  return new Date().toISOString();
}

function renderDashboardHtml(fetchKeyEcho) {
  const dkJson = JSON.stringify(String(fetchKeyEcho || ""));
  const ver = escapeHtml(cheekyOsVersion());
  const port = escapeHtml(String(listenPort()));

  /** Client polls JSON and hydrates DOM; keeps auth cookie/header from initial load only for same-origin fetches — use Bearer in DevTools or ?dk when allowed */
  return `<!DOCTYPE html>
<html lang="en" class="dark"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Cheeky OS v${ver} — Dashboard</title>
<script src="https://cdn.tailwindcss.com"></script>
<script>tailwind.config = { darkMode: 'class', theme: { extend: {} } }</script>
</head>
<body class="bg-slate-950 text-slate-100 min-h-screen">
<div id="root" class="max-w-6xl mx-auto p-4 sm:p-6 space-y-6">
  <header class="flex flex-wrap gap-3 items-center justify-between">
    <div>
      <p class="text-teal-400 font-semibold text-xs uppercase tracking-widest">Cheeky OS v${ver}</p>
      <h1 class="text-2xl sm:text-3xl font-bold text-white">Operator dashboard</h1>
      <p class="text-slate-400 text-sm mt-1">Auto-refresh · Live queue · Intakes & audit trail</p>
    </div>
    <div class="flex flex-wrap gap-2 items-center text-xs text-slate-500">
      <span id="clock" class="mono"></span>
      <button id="themeBtn" type="button" class="rounded-lg border border-slate-700 px-3 py-1 text-slate-300 hover:bg-slate-800">Toggle theme</button>
      <select id="intervalSel" class="rounded-lg bg-slate-900 border border-slate-700 text-slate-200 px-2 py-1">
        <option value="5000">5s refresh</option>
        <option value="15000" selected>15s</option>
        <option value="30000">30s</option>
        <option value="60000">60s</option>
      </select>
      <span class="text-slate-600">:${port}</span>
    </div>
  </header>

  <div id="gridCards" class="grid sm:grid-cols-2 lg:grid-cols-4 gap-3"></div>

  <div class="grid lg:grid-cols-2 gap-4">
    <section class="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden">
      <div class="px-4 py-3 border-b border-slate-800 flex justify-between text-sm font-medium text-slate-300">
        <span>Queue snapshots</span><span id="qmeta" class="text-slate-500 text-xs mono"></span>
      </div>
      <div class="overflow-x-auto max-h-64 overflow-y-auto"><table class="w-full text-xs mono">
        <thead class="text-slate-500 text-left uppercase"><tr><th class="px-3 py-2">At</th><th class="px-3 py-2">Depth</th><th class="px-3 py-2">Ok</th></tr></thead>
        <tbody id="tbodyQ" class="divide-y divide-slate-800"></tbody>
      </table></div>
    </section>

    <section class="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden">
      <div class="px-4 py-3 border-b border-slate-800 text-sm font-medium text-slate-300">Integration status</div>
      <ul id="integList" class="p-3 space-y-2 text-sm"></ul>
    </section>
  </div>

  <section class="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden">
    <div class="px-4 py-3 border-b border-slate-800 text-sm font-medium text-slate-300">Recent intakes</div>
    <div class="overflow-x-auto"><table class="w-full text-sm"><thead class="bg-slate-900 text-xs text-slate-500 uppercase text-left">
      <tr><th class="px-3 py-2">When</th><th class="px-3 py-2">Customer</th><th class="px-3 py-2">Source</th><th class="px-3 py-2">Id</th><th class="px-3 py-2">Dup</th></tr></thead><tbody id="tbodyInt"></tbody></table></div>
  </section>

  <section class="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden">
    <div class="px-4 py-3 border-b border-slate-800 text-sm font-medium text-slate-300">Recent audit events (local ring)</div>
    <div class="overflow-x-auto"><table class="w-full text-sm"><thead class="bg-slate-900 text-xs text-slate-500 uppercase text-left">
      <tr><th class="px-3 py-2">When</th><th class="px-3 py-2">Name</th><th class="px-3 py-2">Severity</th><th class="px-3 py-2">Actor</th></tr></thead><tbody id="tbodyAud"></tbody></table></div>
  </section>

  <section class="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden">
    <div class="px-4 py-3 border-b border-slate-800 text-sm font-medium text-slate-300">Operator jobs</div>
    <div class="overflow-x-auto"><table class="w-full text-sm mono"><thead class="bg-slate-900 text-xs text-slate-500 uppercase text-left">
      <tr><th class="px-3 py-2">Intake</th><th class="px-3 py-2">State</th><th class="px-3 py-2">Status</th><th class="px-3 py-2">At</th></tr></thead><tbody id="tbodyJobs"></tbody></table></div>
  </section>

  <footer class="text-xs text-slate-600 flex flex-wrap gap-3 justify-center mono">
    <a href="/health" class="text-teal-500 hover:underline">/health</a>
    <a href="/metrics" class="text-teal-500 hover:underline">/metrics</a>
    <span>ADMIN ${ADMIN_HEADER} · Dashboard X-Cheeky-Dashboard-Key or Bearer</span>
  </footer>
</div>
<script>
window.__CH_DASH_FETCH_KEY = ${dkJson};
(async function(){
  const $ = (s)=>document.querySelector(s);

  $('#themeBtn').onclick = () => {
    document.documentElement.classList.toggle('dark');
    localStorage.setItem('cheekyDashTheme', document.documentElement.classList.contains('dark') ? 'dark':'light');
  };
  if (localStorage.getItem('cheekyDashTheme') === 'light') document.documentElement.classList.remove('dark');

  async function refresh(){
    $('#clock').textContent = new Date().toISOString().slice(11,19)+' UTC';
    const hdr = { Accept: 'application/json' };
    const k = typeof window.__CH_DASH_FETCH_KEY === 'string' ? window.__CH_DASH_FETCH_KEY : '';
    if (k) hdr['X-Cheeky-Dashboard-Key'] = k;

    const r = await fetch('/api/cheeky-os/dashboard-data', {
      credentials: 'same-origin',
      headers: hdr
    }).catch(()=>null);
    if (!r || !r.ok) {
      $('tbodyQ').innerHTML = '<tr><td colspan="3" class="px-3 py-8 text-red-400">Auth required or network error · set X-Cheeky-Dashboard-Key / Bearer for API</td></tr>';
      return;
    }
    const d = await r.json();
    const o = d.observability || {}; const w = o.worker||{};

    const cards = [];
    cards.push(card('Worker', w.enabled ? (w.running?'Running':'Stopped') : 'Disabled', workerSub(w)));
    cards.push(card('Queue', lastDepth(o.operatorQueueRecent), lastQDetail(o.operatorQueueRecent)));
    cards.push(card('Intakes', String(o.intake?.acceptedCount||0), o.intake?.lastAt||'never'));
    cards.push(card('Dataverse env', (d.dataverseProfile||'default'), 'profile selector'));
    (d.integrations||[]).forEach(x=>{
      cards.push(card(x.label, x.ok?'OK':'Check', escapeHtmlStrip(x.detail||'')));
    });
    $('gridCards').innerHTML = cards.slice(0,8).map(c=>'<div class="rounded-xl border border-slate-800 bg-slate-900/50 p-4">'+c+'</div>').join('');

    function workerSub(w){
      return 'polls='+(w.polls||0)+' · ok/fail '+ (w.ticksOk||0)+'/'+ (w.ticksFailed||0) + (w.lastLoopError?' · '+escapeHtmlStrip(w.lastLoopError):'');
    }
    function lastDepth(snaps){
      if (!snaps||!snaps.length) return '—';
      const l = snaps[snaps.length-1];
      return String(l.depth||0)+' jobs';
    }
    function lastQDetail(snaps){
      if (!snaps||!snaps.length) return 'waiting for poll';
      const l = snaps[snaps.length-1];
      return (l.ok?'ok':'err')+' · '+ (l.at||'') + (l.error? ' · '+escapeHtmlStrip(l.error):'');
    }
    $('qmeta').textContent = String((o.operatorQueueRecent||[]).length)+' rows';

    fillTable('tbodyQ', (o.operatorQueueRecent||[]).slice(-20).reverse().map(q=>[
      q.at||'', String(q.depth||0), q.ok?'yes':'NO'
    ]));
    fillTable('tbodyInt', (o.recentIntakes||[]).slice(-30).reverse().map(i=>[
      i.at||'', i.customer||'', i.source||'', (i.intakeId||'').slice(0,8)||'—', i.duplicate?'dup':'—'
    ]));
    fillTable('tbodyAud', (o.recentAuditEvents||[]).slice(-30).reverse().map(a=>[
      a.at||'', a.name||'', a.severity||'', a.actor||''
    ]));
    fillTable('tbodyJobs', (o.recentOperatorJobs||[]).slice(-35).reverse().map(j=>[
      j.intakeId||'—', j.lifecycle||'', j.statusLabel||'', j.at||''
    ]));
    $('integList').innerHTML = '';
    (d.integrations||[]).forEach(x=>{
      const li=document.createElement('li');
      li.className='flex gap-2 items-start rounded-lg border border-slate-800/80 p-2';
      li.innerHTML = '<span>'+(x.ok?'✅':'⚠️')+'</span><div><div class="font-medium">'+escapeHtmlStrip(x.label)+'</div><div class="text-slate-500 text-xs">'+escapeHtmlStrip(x.detail||'')+'</div></div>';
      $('integList').appendChild(li);
    });
  }

  function card(title, big, small){
    return '<div class="text-xs uppercase text-slate-500">' + escapeHtmlStrip(title) + '</div>' +
           '<div class="text-xl font-semibold mt-1 text-white">' + escapeHtmlStrip(big) + '</div>' +
           '<div class="text-xs text-slate-400 mt-2">' + small + '</div>';
  }

  function escapeHtmlStrip(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;'); }

  function fillTable(tbodyId, rows){
    const tb=$(tbodyId); if(!rows||!rows.length){ tb.innerHTML='<tr><td colspan="12" class="px-3 py-6 text-center text-slate-500">No rows</td></tr>'; return; }
    tb.innerHTML = rows.map(r=>'<tr class="divide-slate-800">'+r.map(c=>'<td class="px-3 py-1.5 border-b border-slate-800">'+escapeHtmlStrip(c)+'</td>').join('')+'</tr>').join('');
  }

  let pollMs = Number($('#intervalSel').value) || 15000;
  $('#intervalSel').onchange = () => {
    pollMs = Number($('#intervalSel').value) || 15000;
  };

  async function spin() {
    await refresh().catch(() => {});
    pollMs = Number($('#intervalSel').value) || pollMs;
    setTimeout(spin, pollMs);
  }

  spin();
})();
</script>
<style>.mono{font-family:ui-monospace,Courier,monospace}</style></body></html>`;
}

router.get("/dashboard", requireDashboardAuth, (req, res) => {
  const echo =
    typeof req.cheekDashboardFetchKeyEcho === "string" ? req.cheekDashboardFetchKeyEcho : "";
  res.type("html").send(renderDashboardHtml(echo));
});

function requireAdminJson(req, res, next) {
  const configured = !!String(process.env.CHEEKY_ADMIN_API_KEY || "").trim();
  if (!configured) {
    res.status(503).json({
      ok: false,
      error: "admin_disabled",
      detail: "Set CHEEKY_ADMIN_API_KEY then send header " + ADMIN_HEADER,
    });
    return;
  }
  const k = getAdminKeyFromRequest(req);
  const expected = String(process.env.CHEEKY_ADMIN_API_KEY || "").trim();
  if (!k || k !== expected) {
    res.status(401).json({ ok: false, error: "unauthorized" });
    return;
  }
  next();
}

router.post("/admin/restart-worker", requireAdminJson, (req, res) => {
  try {
    const { restartOperatorWorker } = require("../services/operatorAutonomousWorker.service");
    const ip = clientIp(req);
    recordAdminAudit({ action: "restart_worker", actor: "admin", ip, meta: {} });
    logStructured("admin_restart_worker", { ip });
    const w = restartOperatorWorker();
    res.json({
      ok: true,
      worker: {
        enabled: !!w.enabled,
        running: !!w.running,
        polls: w.polls,
      },
    });
  } catch (e) {
    res.status(500).json({
      ok: false,
      error: e && e.message ? e.message : String(e),
    });
  }
});

router.post("/admin/trigger-test-intake", requireAdminJson, express.json({ limit: "256kb" }), async (req, res) => {
  const ip = clientIp(req);
  recordAdminAudit({ action: "trigger_test_intake", actor: "admin", ip, meta: {} });
  logStructured("admin_trigger_test_intake", { ip });
  const port = listenPort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const stamp = `${Date.now()}`;
  try {
    const rawBody =
      req.body && typeof req.body === "object" && Object.keys(req.body).length ? req.body : {};
    const body =
      rawBody.customer_name ||
      rawBody.request_text ||
      rawBody.customerName ||
      rawBody.requestText
        ? rawBody
        : {
            customer_name: `ADMIN test intake ${stamp}`.slice(0, 100),
            request_text: `${stamp} quick admin probe — qty 24 shirts`,
            source: `admin_trigger_${stamp}`,
          };
    const r = await fetch(`${baseUrl}/api/intake`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const text = await r.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch (_) {
      data = { __raw: text.slice(0, 800) };
    }
    res.status(r.ok ? 200 : 502).json({
      ok: r.ok,
      status: r.status,
      data,
    });
  } catch (e) {
    res.status(500).json({
      ok: false,
      error: e && e.message ? e.message : String(e),
    });
  }
});

router.get("/admin/health", requireAdminJson, (req, res) => {
  const ip = clientIp(req);
  recordAdminAudit({ action: "admin_health_read", actor: "admin", ip, meta: {} });
  res.json({ ok: true, report: buildDetailedHealthReport() });
});

module.exports = router;
