/**
 * Bundle 11 — GET /founder/today
 */

const { Router } = require("express");
const { getFounderDashboardPayload } = require("../services/founderTodayService");
const { priVal } = require("../services/automationActionsService");
const { prepareMessage } = require("../services/messagePrepService");
const { getDailySummary } = require("../services/dailySummaryService");
const { getCopilotTodayPayload } = require("../services/copilotService");

const router = Router();

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const BTN =
  "display:inline-block;padding:14px 16px;margin:6px 6px 0 0;min-height:48px;line-height:1.2;border-radius:12px;text-decoration:none;font-weight:700;font-size:0.95rem;text-align:center;border:1px solid #334;background:#1a1d26;color:#7dd3fc;";

const BTN_SUBMIT =
  "width:100%;box-sizing:border-box;padding:14px 16px;margin-top:10px;border-radius:12px;font-weight:800;font-size:0.95rem;border:1px solid #334155;background:#1e3a5f;color:#7dd3fc;cursor:pointer;min-height:48px;";
const INPUT =
  "width:100%;box-sizing:border-box;padding:10px 12px;margin-top:4px;border-radius:10px;border:1px solid #475569;background:#0f1419;color:#e2e8f0;font-size:1rem;";

function systemCheckPanelHtml() {
  const btnStyle =
    "min-width:220px;padding:14px 18px;border-radius:12px;font-weight:800;font-size:0.95rem;border:1px solid #166534;background:#14532d;color:#bbf7d0;cursor:pointer;min-height:48px;";
  return (
    '<section style="margin:0 0 18px 0;padding:16px;border-radius:16px;background:#0c1a14;border:1px solid #22c55e;">' +
    '<h2 style="font-size:1.02rem;margin:0 0 10px;color:#86efac;font-weight:800;">⚡ RUN SYSTEM CHECK</h2>' +
    '<p style="margin:0 0 12px;font-size:0.88rem;opacity:0.88;line-height:1.4;color:#d1fae5;">Full snapshot: <code style="background:#052e16;padding:2px 6px;border-radius:6px;">GET /system/check</code> · reloads this page with fresh data.</p>' +
    '<button type="button" id="sys-check-btn" onclick="if(window.cheekyRunSystemCheck)window.cheekyRunSystemCheck();" style="' +
    btnStyle +
    '">Refresh System</button>' +
    '<div id="sys-check-status" style="margin-top:10px;font-size:0.88rem;color:#a7f3d0;"></div>' +
    '<div id="sys-check-last" style="margin-top:8px;font-size:0.82rem;color:#6ee7b7;">Last updated: —</div>' +
    "<script>(function(){var k='cheeky_os_last_system_check';var el=document.getElementById('sys-check-last');" +
    "function disp(t){if(!el)return;el.textContent=t?'Last updated: '+new Date(t).toLocaleString():'Last updated: \\u2014';}" +
    "try{disp(localStorage.getItem(k));}catch(e){disp('');}" +
    "window.cheekyRunSystemCheck=function(){" +
    "var btn=document.getElementById('sys-check-btn');var st=document.getElementById('sys-check-status');" +
    "if(btn)btn.disabled=true;if(st)st.textContent='Running check\\u2026';" +
    "fetch('/system/check').then(function(r){return r.json();}).then(function(d){" +
    "var ts=d&&d.timestamp||(new Date()).toISOString();try{localStorage.setItem(k,ts);}catch(e){}" +
    "if(st)st.textContent='OK \\u00b7 '+(d&&d.actions&&d.actions.length||0)+' actions \\u00b7 '+(d&&d.alerts&&d.alerts.length||0)+' alerts';" +
    "if(btn)btn.disabled=false;location.reload();}).catch(function(){" +
    "if(st)st.textContent='Check failed \\u2014 try again.';if(btn)btn.disabled=false;});};})();<\/script>" +
    "</section>"
  );
}

function automationIntervalPanelHtml() {
  const btnOn =
    "min-width:200px;padding:14px 16px;margin:8px 8px 0 0;border-radius:12px;font-weight:800;font-size:0.92rem;border:1px solid #14532d;background:#166534;color:#ecfdf5;cursor:pointer;min-height:48px;";
  const btnOff =
    "min-width:200px;padding:14px 16px;margin:8px 8px 0 0;border-radius:12px;font-weight:800;font-size:0.92rem;border:1px solid #991b1b;background:#7f1d1d;color:#fee2e2;cursor:pointer;min-height:48px;";
  return (
    '<section style="margin:0 0 18px 0;padding:16px;border-radius:16px;background:#14161f;border:1px solid #475569;">' +
    '<h2 style="font-size:1.02rem;margin:0 0 12px;color:#cbd5e1;font-weight:800;">⚙️ AUTOMATION STATUS</h2>' +
    '<p style="margin:0 0 10px;font-size:0.88rem;line-height:1.45;color:#94a3b8;">Timed system checks (in-memory). <code style="background:#1e293b;padding:2px 6px;border-radius:6px;">GET /system/status</code></p>' +
    '<div style="font-size:0.95rem;line-height:1.55;"><span style="opacity:0.8;">Status:</span> <strong id="auto-int-running" style="color:#f8fafc;">—</strong></div>' +
    '<div style="font-size:0.9rem;margin-top:6px;"><span style="opacity:0.8;">Last run:</span> <span id="auto-int-last" style="color:#e2e8f0;">—</span></div>' +
    '<div style="font-size:0.9rem;margin-top:6px;"><span style="opacity:0.8;">Interval:</span> <span id="auto-int-interval" style="color:#e2e8f0;">—</span></div>' +
    '<div style="margin-top:12px;display:flex;flex-wrap:wrap;">' +
    '<button type="button" id="auto-int-start" onclick="if(window.cheekyAutoStart)window.cheekyAutoStart();" style="' +
    btnOn +
    '">Start Automation</button>' +
    '<button type="button" id="auto-int-stop" onclick="if(window.cheekyAutoStop)window.cheekyAutoStop();" style="' +
    btnOff +
    '">Stop Automation</button></div>' +
    '<div id="auto-int-msg" style="margin-top:10px;font-size:0.85rem;color:#94a3b8;"></div>' +
    "<script>(function(){function fmtMin(ms){var m=Math.max(1,Math.round((ms||300000)/60000));return m+' minute'+(m===1?'':'s');}" +
    "function paint(d){var r=document.getElementById('auto-int-running');var l=document.getElementById('auto-int-last');var i=document.getElementById('auto-int-interval');" +
    "if(r)r.textContent=d&&d.isRunning?'RUNNING':'STOPPED';" +
    "if(l)l.textContent=d&&d.lastRun?new Date(d.lastRun).toLocaleString():'\\u2014';" +
    "if(i)i.textContent=fmtMin(d&&d.intervalMs);}" +
    "function refresh(){fetch('/system/status').then(function(x){return x.json();}).then(paint).catch(function(){});}" +
    "window.cheekyAutoStart=function(){var m=document.getElementById('auto-int-msg');if(m)m.textContent='Starting\\u2026';" +
    "fetch('/system/start',{method:'POST'}).then(function(x){return x.json();}).then(function(j){if(m)m.textContent=(j&&j.message)||'';refresh();}).catch(function(){if(m)m.textContent='Start failed.';});};" +
    "window.cheekyAutoStop=function(){var m=document.getElementById('auto-int-msg');if(m)m.textContent='Stopping\\u2026';" +
    "fetch('/system/stop',{method:'POST'}).then(function(x){return x.json();}).then(function(j){if(m)m.textContent=(j&&j.message)||'';refresh();}).catch(function(){if(m)m.textContent='Stop failed.';});};" +
    "refresh();setInterval(refresh,8000);})();<\/script>" +
    "</section>"
  );
}

function copilotHtml(cp) {
  const msg =
    String((cp && cp.message) || "").trim() ||
    "Review follow-ups and blockers on the board below.";
  const tops = Array.isArray(cp && cp.topActions)
    ? /** @type {object[]} */ (cp.topActions).slice(0, 3)
    : [];
  const list = tops.length
    ? tops
        .map((t) => {
          if (!t || typeof t !== "object") return "";
          const label = String(
            /** @type {{ label?: string }} */ (t).label || ""
          ).trim();
          const cn = String(
            /** @type {{ customerName?: string }} */ (t).customerName || ""
          ).trim();
          const line =
            [label, cn].filter(Boolean).join(" · ") ||
            String(/** @type {{ type?: string }} */ (t).type || "").trim();
          return line
            ? `<li style="margin:8px 0;line-height:1.4;">${esc(line)}</li>`
            : "";
        })
        .filter(Boolean)
        .join("")
    : "";
  return `<section style="margin:0 0 18px 0;padding:18px;border-radius:16px;background:#1a1033;border:2px solid #a78bfa;">
  <h2 style="font-size:1.05rem;margin:0 0 14px;color:#f5f3ff;font-weight:800;letter-spacing:0.02em;">🧠 COPILOT SAYS</h2>
  <div style="font-size:1.12rem;line-height:1.55;color:#faf5ff;font-weight:650;white-space:pre-wrap;word-break:break-word;text-shadow:0 1px 0 rgba(0,0,0,0.35);">${esc(
    msg
  )}</div>
  ${
    list
      ? `<ul style="margin:16px 0 0 0;padding-left:1.15rem;color:#ddd6fe;font-size:1rem;line-height:1.35;list-style:disc;">${list}</ul>`
      : ""
  }
</section>`;
}

function todaySummaryHtml(sum) {
  const c = (sum && sum.counts) || {};
  const h = (sum && sum.highlights) || {};
  const n = (x) => Number(x) || 0;
  const line = (label, val) =>
    `<div style="display:flex;justify-content:space-between;align-items:baseline;gap:12px;margin:8px 0;font-size:0.95rem;"><span style="opacity:0.88;">${esc(
      label
    )}</span><span style="font-weight:800;font-size:1.02rem;color:#f8fafc;">${esc(
      String(val)
    )}</span></div>`;
  const topA = String(h.topAction || "").trim() || "—";
  const big = String(h.biggestOpportunity || "").trim() || "—";
  const tc = String(h.topCustomer || "").trim();
  return `<section style="margin:0 0 18px 0;padding:16px;border-radius:16px;background:#0f172a;border:1px solid #1e40af;">
  <h2 style="font-size:1.08rem;margin:0 0 12px;color:#38bdf8;font-weight:800;">📊 TODAY SUMMARY</h2>
  ${line("Urgent Follow-ups", n(c.urgentFollowups))}
  ${line("Blocked Orders", n(c.blockedOrders))}
  ${line("Ready to Print", n(c.readyToPrint))}
  ${line("In Production", n(c.inProduction))}
  ${line("High Risk Jobs", n(c.highRiskOrders))}
  <div style="margin-top:14px;padding-top:12px;border-top:1px solid #334155;">
    <div style="font-size:0.7rem;font-weight:800;color:#fb923c;margin-bottom:6px;letter-spacing:0.06em;">🔥 TOP ACTION</div>
    <div style="font-size:1rem;font-weight:700;line-height:1.35;color:#e2e8f0;">${esc(topA)}</div>
    ${
      tc
        ? `<div style="margin-top:4px;font-size:0.88rem;opacity:0.88;">${esc(
            tc
          )}</div>`
        : ""
    }
  </div>
  <div style="margin-top:12px;">
    <div style="font-size:0.7rem;font-weight:800;color:#4ade80;margin-bottom:6px;letter-spacing:0.06em;">💰 BIGGEST OPPORTUNITY</div>
    <div style="font-size:0.95rem;line-height:1.45;color:#dcfce7;">${esc(big)}</div>
  </div>
</section>`;
}

function actionExecuteJsonExample(a) {
  const t = String(a.type || "").toLowerCase();
  const ex = {
    approved: true,
    actionType: t || "review",
    orderId: a.orderId || "",
    customerId: "",
    payload: {},
  };
  if (t === "invoice") {
    ex.customerId = "YOUR_SQUARE_CUSTOMER_ID";
    ex.payload = {
      customerName: a.customerName || "",
      amount: 100,
      description: "Custom T-Shirts",
      sourceType: "followup",
    };
  }
  return JSON.stringify(ex, null, 2);
}

function cardCopyMessageSection(a) {
  const t = String(a.type || "").toLowerCase();
  if (t !== "followup" && t !== "invoice") return "";
  const prep = prepareMessage({
    type: t,
    customerName: a.customerName,
    amount: a.amount,
    daysOld: a.daysOld,
  });
  return `
  <div style="margin-top:12px;padding:12px;border-radius:12px;background:#0f172a;border:1px solid #334155;">
    <div style="font-size:0.72rem;font-weight:800;color:#a5b4fc;margin-bottom:8px;letter-spacing:0.04em;">COPY MESSAGE</div>
    <div style="font-size:0.95rem;line-height:1.5;color:#e2e8f0;white-space:pre-wrap;word-break:break-word;user-select:all;">${esc(
      prep.message
    )}</div>
  </div>`;
}

function cardSystemExecuteControls(a) {
  const t = String(a.type || "").toLowerCase();
  const oid = esc(a.orderId || "");
  const cname = esc(a.customerName || "");

  if (t === "production") {
    return `<form method="post" action="/automation/execute" style="margin-top:12px;">
  <input type="hidden" name="approved" value="true" />
  <input type="hidden" name="actionType" value="production" />
  <input type="hidden" name="orderId" value="${oid}" />
  <button type="submit" style="${BTN_SUBMIT}">Move to Printing</button>
</form>
<details style="margin-top:10px;font-size:0.8rem;opacity:0.9;"><summary style="cursor:pointer;">Copy JSON</summary>
<pre style="white-space:pre-wrap;word-break:break-all;background:#0c0e12;padding:10px;border-radius:10px;border:1px solid #334;">${esc(
      actionExecuteJsonExample(a)
    )}</pre>
</details>`;
  }

  if (t === "invoice") {
    return `<form method="post" action="/automation/execute" style="margin-top:12px;display:flex;flex-direction:column;gap:10px;">
  <input type="hidden" name="approved" value="true" />
  <input type="hidden" name="actionType" value="invoice" />
  <input type="hidden" name="orderId" value="${oid}" />
  <label style="font-size:0.82rem;font-weight:600;">Square customer ID
    <input name="customerId" required autocomplete="off" placeholder="cus_…" style="${INPUT}" />
  </label>
  <label style="font-size:0.82rem;font-weight:600;">Amount (USD)
    <input name="payload[amount]" type="number" step="0.01" min="0.01" required value="100" style="${INPUT}" />
  </label>
  <label style="font-size:0.82rem;font-weight:600;">Description
    <input name="payload[description]" value="Custom T-Shirts" style="${INPUT}" />
  </label>
  <input type="hidden" name="payload[customerName]" value="${cname}" />
  <input type="hidden" name="payload[sourceType]" value="followup" />
  <button type="submit" style="${BTN_SUBMIT}">Create Draft Invoice</button>
</form>
<details style="margin-top:10px;font-size:0.8rem;opacity:0.9;"><summary style="cursor:pointer;">Copy JSON</summary>
<pre style="white-space:pre-wrap;word-break:break-all;background:#0c0e12;padding:10px;border-radius:10px;border:1px solid #334;">${esc(
      actionExecuteJsonExample(a)
    )}</pre>
</details>`;
  }

  if (t === "followup") {
    return `<div style="margin-top:12px;padding:12px;border-radius:12px;background:#111827;border:1px solid #3730a3;font-size:0.9rem;line-height:1.45;color:#c7d2fe;">Call / Email manually · use scripts or CRM — no auto-send from this endpoint yet.</div>
<details style="margin-top:10px;font-size:0.8rem;opacity:0.9;"><summary style="cursor:pointer;">Copy JSON</summary>
<pre style="white-space:pre-wrap;word-break:break-all;background:#0c0e12;padding:10px;border-radius:10px;border:1px solid #334;">${esc(
      actionExecuteJsonExample(a)
    )}</pre>
</details>`;
  }

  if (t === "review") {
    return `<div style="margin-top:12px;padding:12px;border-radius:12px;background:#1a1508;border:1px solid #b45309;font-size:0.9rem;line-height:1.45;color:#fde68a;">Manual review needed — check job details before moving money or production.</div>
<details style="margin-top:10px;font-size:0.8rem;opacity:0.9;"><summary style="cursor:pointer;">Copy JSON</summary>
<pre style="white-space:pre-wrap;word-break:break-all;background:#0c0e12;padding:10px;border-radius:10px;border:1px solid #334;">${esc(
      actionExecuteJsonExample(a)
    )}</pre>
</details>`;
  }

  return "";
}

function cardSystemAction(a) {
  const pr = String(a.priority || "low").toUpperCase();
  const prColor =
    pr === "CRITICAL"
      ? "#fecaca"
      : pr === "HIGH"
        ? "#fdba74"
        : pr === "MEDIUM"
          ? "#93c5fd"
          : "#94a3b8";
  const band =
    pr === "CRITICAL"
      ? "background:#450a0a;border:2px solid #ef4444;box-shadow:0 0 0 1px rgba(239,68,68,0.35);"
      : pr === "HIGH"
        ? "background:#431407;border:1px solid #ea580c;"
        : "background:#151922;border:1px solid #334155;";
  let hint = "";
  const t = String(a.type || "").toLowerCase();
  if (t === "followup") hint = "Call / Email manually";
  else if (t === "invoice") hint = "Create draft invoice";
  else if (t === "production") hint = "Move to printing";
  const hintHtml = hint
    ? `<div style="margin-top:8px;font-size:0.82rem;opacity:0.88;color:#a5b4fc;">${esc(
        hint
      )}</div>`
    : "";
  const execHtml = cardSystemExecuteControls(a);
  return `
  <div style="margin-bottom:12px;padding:14px;border-radius:14px;${band}">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;">
      <span style="font-weight:800;font-size:1.05rem;line-height:1.35;">${esc(
        a.label || ""
      )}</span>
      <span style="font-size:0.72rem;font-weight:800;color:${prColor};white-space:nowrap;">${esc(
        pr
      )}</span>
    </div>
    <div style="margin-top:8px;font-weight:600;">${esc(a.customerName || "")}</div>
    <div style="margin-top:6px;font-size:0.9rem;opacity:0.9;line-height:1.4;">${esc(
      a.reason || ""
    )}</div>
    ${cardCopyMessageSection(a)}
    ${hintHtml}
    ${execHtml}
  </div>`;
}

function cardNext(next) {
  const a = (next && next.action) || "—";
  const r = (next && next.reason) || "";
  return `
  <div style="background:#0f172a;border:2px solid #38bdf8;border-radius:16px;padding:18px;margin-bottom:20px;">
    <div style="font-size:0.72rem;text-transform:uppercase;letter-spacing:0.08em;color:#7dd3fc;margin-bottom:8px;">Next best action</div>
    <div style="font-size:1.2rem;font-weight:800;line-height:1.35;margin-bottom:10px;">${esc(a)}</div>
    <div style="opacity:0.9;font-size:0.98rem;">${esc(r)}</div>
  </div>`;
}

function cardBlocker(b) {
  return `
  <div style="background:#1c0a0a;border:2px solid #dc2626;border-radius:14px;padding:16px;margin-bottom:12px;">
    <div style="font-size:0.75rem;font-weight:800;color:#fca5a5;letter-spacing:0.06em;margin-bottom:8px;">BLOCKED</div>
    <div style="font-weight:800;font-size:1.08rem;">${esc(b.customerName)}</div>
    <div style="margin-top:8px;font-size:0.98rem;">${esc(b.product || "—")} × ${esc(
    String(b.quantity ?? 0)
  )}</div>
    <div style="margin-top:6px;font-size:0.9rem;opacity:0.85;">Status: <strong>${esc(
      b.status || ""
    )}</strong></div>
    <div style="margin-top:10px;font-size:0.92rem;color:#fecaca;">${esc(
      b.gateReason || ""
    )}</div>
  </div>`;
}

function cardFollowup(u) {
  const amt = Number(u.amount) || 0;
  const phoneRaw = String(u.phone || "").replace(/\s/g, "");
  const phone = phoneRaw
    ? `<a href="tel:${esc(phoneRaw)}" style="color:#4ade80;font-weight:700;font-size:1.05rem;">${esc(
        u.phone
      )}</a>`
    : "—";
  const em = String(u.email || "").trim();
  const email = em
    ? `<a href="mailto:${esc(em)}" style="color:#4ade80;font-weight:700;word-break:break-all;">${esc(
        em
      )}</a>`
    : "—";
  const pr = String(u.priority || "").toUpperCase();
  const prColor =
    pr === "CRITICAL" ? "#ef4444" : pr === "HIGH" ? "#f97316" : "#94a3b8";
  return `
  <div style="background:#151922;border:1px solid #333;border-radius:14px;padding:16px;margin-bottom:12px;">
    <div style="font-size:0.72rem;font-weight:800;color:${prColor};margin-bottom:6px;">${esc(
      pr || "FOLLOW-UP"
    )}</div>
    <div style="font-weight:800;font-size:1.05rem;">${esc(u.customerName)}</div>
    <div style="margin-top:8px;">$${esc(String(Math.round(amt)))} · ${esc(
    String(u.daysOld ?? "")
  )} days</div>
    <div style="margin-top:12px;line-height:1.6;">${phone}</div>
    <div style="margin-top:6px;">${email}</div>
  </div>`;
}

function cardReady(r) {
  return `
  <div style="background:#0f1f14;border:1px solid #22c55e;border-radius:14px;padding:16px;margin-bottom:10px;">
    <div style="font-size:0.72rem;font-weight:800;color:#4ade80;margin-bottom:6px;">READY</div>
    <div style="font-weight:800;">${esc(r.customerName)}</div>
    <div style="margin-top:8px;font-size:0.95rem;">${esc(r.product || "")} × ${esc(
    String(r.quantity ?? 0)
  )}</div>
    <div style="margin-top:6px;font-size:0.9rem;">Print: ${esc(
      r.printType || "—"
    )}</div>
    <div style="margin-top:4px;font-size:0.9rem;">Due: ${esc(r.dueDate || "—")}</div>
  </div>`;
}

function cardHighRisk(h) {
  return `
  <div style="background:#1a1508;border:1px solid #f59e0b;border-radius:14px;padding:16px;margin-bottom:10px;">
    <div style="font-size:0.72rem;font-weight:800;color:#fbbf24;margin-bottom:6px;">HIGH / NEEDS CLARIFICATION</div>
    <div style="font-weight:800;">${esc(h.customerName)}</div>
    <div style="margin-top:8px;font-size:0.92rem;">${esc(h.product || "")} × ${esc(
    String(h.quantity ?? 0)
  )}</div>
    <div style="margin-top:6px;font-size:0.88rem;opacity:0.9;">${esc(h.hint || "")}</div>
  </div>`;
}

function cardQueueItem(item, label) {
  return `
  <div style="background:#141820;border:1px solid #2a3544;border-radius:12px;padding:14px;margin-bottom:8px;">
    <div style="font-size:0.7rem;color:#94a3b8;margin-bottom:4px;">${esc(label)}</div>
    <div style="font-weight:700;">${esc(item.customerName)}</div>
    <div style="font-size:0.9rem;margin-top:6px;">${esc(item.product || "")} × ${esc(
    String(item.quantity ?? 0)
  )}</div>
  </div>`;
}

function cardJobMemory(j) {
  const note = j.latestNote;
  const dec = j.latestDecision;
  const hf = j.highFlags || [];
  const noteTxt =
    note && note.text ? esc(String(note.text)) : "—";
  const decTxt =
    dec && dec.text ? esc(String(dec.text)) : "—";
  const flagsTxt = hf.length
    ? hf.map((f) => esc(String((f && f.label) || ""))).join(", ")
    : "—";
  const memHint = j.hasMemory
    ? ""
    : `<div style="opacity:0.7;font-size:0.88rem;margin-top:10px;font-style:italic;">No stored context yet</div>`;

  const intel = j.intelligence;
  const risk = intel && intel.risk ? String(intel.risk.level || "low") : "low";
  const riskUp = risk.toUpperCase();
  const riskColor =
    risk === "high" ? "#f87171" : risk === "medium" ? "#fbbf24" : "#64748b";
  const rec =
    intel && intel.recommendation
      ? esc(String(intel.recommendation))
      : "—";
  const up =
    intel && intel.upsell && intel.upsell.suggestion
      ? esc(String(intel.upsell.suggestion))
      : "";

  const riskBand =
    risk === "high"
      ? "background:#3f1515;border:1px solid #b91c1c;"
      : risk === "medium"
        ? "background:#2a2210;border:1px solid #b45309;"
        : "background:#151c22;border:1px solid #334155;";

  return `
  <div style="background:#12161f;border:1px solid #334155;border-radius:14px;padding:16px;margin-bottom:12px;">
    <div style="font-size:0.7rem;color:#64748b;margin-bottom:6px;word-break:break-all;">${esc(
      j.orderId || ""
    )}</div>
    <div style="font-weight:800;font-size:1.05rem;">${esc(j.customerName)}</div>
    <div style="margin-top:6px;font-size:0.92rem;">${esc(j.product || "")} × ${esc(
    String(j.quantity ?? 0)
  )} · <span style="opacity:0.85;">${esc(j.status || "")}</span></div>
    <div style="margin-top:12px;padding:10px 12px;border-radius:10px;${riskBand}">
      <span style="font-size:0.72rem;letter-spacing:0.06em;font-weight:800;color:${riskColor};">RISK ${esc(
    riskUp
  )}</span>
      <div style="margin-top:8px;font-size:0.95rem;font-weight:600;line-height:1.4;color:#e2e8f0;">${rec}</div>
      ${
        up
          ? `<div style="margin-top:6px;font-size:0.88rem;opacity:0.9;color:#a5b4fc;">Upsell: ${up}</div>`
          : ""
      }
    </div>
    <div style="margin-top:10px;font-size:0.88rem;line-height:1.45;"><span style="color:#7dd3fc;">Latest note:</span> ${noteTxt}</div>
    <div style="margin-top:4px;font-size:0.88rem;line-height:1.45;"><span style="color:#a78bfa;">Latest decision:</span> ${decTxt}</div>
    <div style="margin-top:4px;font-size:0.88rem;line-height:1.45;"><span style="color:#f87171;">High-severity flags:</span> ${flagsTxt}</div>
    ${memHint}
  </div>`;
}

router.get("/today", async (_req, res) => {
  let data;
  try {
    data = await getFounderDashboardPayload();
  } catch (err) {
    console.error("[founder/today]", err.message || err);
    data = {
      next: {
        action: "Unable to load",
        reason: String(err.message || err),
      },
      systemActions: [],
      paymentBlockers: [],
      urgentFollowups: [],
      readyForProduction: [],
      highRisk: [],
      queue: { ready: [], printing: [], qc: [] },
      jobMemory: [],
    };
  }

  let summary;
  try {
    summary = await getDailySummary();
  } catch (err) {
    console.error("[founder/today] summary:", err.message || err);
    summary = {
      counts: {},
      highlights: {},
    };
  }

  let copilot;
  try {
    copilot = await getCopilotTodayPayload();
  } catch (err) {
    console.error("[founder/today] copilot:", err.message || err);
    copilot = {
      message:
        "Review follow-ups and payment blockers first, then work through system actions.",
      topActions: [],
      alerts: [],
      suggestions: [],
    };
  }

  const next = data.next || {};
  const sa = (data.systemActions || [])
    .slice()
    .sort((x, y) => priVal(x.priority) - priVal(y.priority));
  const jm = data.jobMemory || [];
  const pb = data.paymentBlockers || [];
  const uf = data.urgentFollowups || [];
  const rf = data.readyForProduction || [];
  const hr = data.highRisk || [];
  const q = data.queue || { ready: [], printing: [], qc: [] };

  const pbHtml = pb.length
    ? pb.map(cardBlocker).join("")
    : `<p style="opacity:0.6;">No payment/deposit blockers on file.</p>`;
  const ufHtml = uf.length
    ? uf.map(cardFollowup).join("")
    : `<p style="opacity:0.6;">No urgent scored follow-ups.</p>`;
  const rfHtml = rf.length
    ? rf.map(cardReady).join("")
    : `<p style="opacity:0.6;">No gate-cleared READY orders.</p>`;
  const hrHtml = hr.length
    ? hr.map(cardHighRisk).join("")
    : `<p style="opacity:0.6;">Nothing flagged for clarification.</p>`;

  const progParts = [
    ...(q.printing || []).map((it) => cardQueueItem(it, "PRINTING")),
    ...(q.qc || []).map((it) => cardQueueItem(it, "QC")),
  ];
  const progHtml = progParts.length
    ? progParts.join("")
    : `<p style="opacity:0.6;">Nothing in print or QC.</p>`;

  const jmHtml = jm.length
    ? jm.map(cardJobMemory).join("")
    : `<p style="opacity:0.6;">No orders in memory preview.</p>`;

  const saHtml = sa.length
    ? sa.map(cardSystemAction).join("")
    : `<p style="opacity:0.6;">No system actions right now.</p>`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"/>
  <title>Founder — Today</title>
</head>
<body style="margin:0;padding:16px;padding-bottom:max(28px,env(safe-area-inset-bottom));font-family:system-ui,-apple-system,sans-serif;background:#0a0c10;color:#e8eaed;max-width:560px;margin-left:auto;margin-right:auto;">
  ${systemCheckPanelHtml()}
  ${automationIntervalPanelHtml()}
  ${copilotHtml(copilot)}
  ${todaySummaryHtml(summary)}
  <h1 style="font-size:1.5rem;margin:8px 0 6px;color:#7dd3fc;">Founder — Today</h1>
  <p style="opacity:0.85;margin:0 0 14px;font-size:0.95rem;">Daily command board</p>

  <div style="display:flex;flex-wrap:wrap;margin:0 -4px 18px -4px;">
    <a href="/ops/today" style="${BTN}">Ops</a>
    <a href="/dashboard/today/mobile" style="${BTN}">Sales mobile</a>
    <a href="/production/mobile" style="${BTN}">Production</a>
    <a href="/capture/founder" style="${BTN}">Brief workbench</a>
    <a href="/automation/actions" style="${BTN}">Actions (JSON)</a>
  </div>

  <section style="margin-bottom:22px;">
    <h2 style="font-size:1.08rem;margin:0 0 10px;color:#f0abfc;">🚀 SYSTEM ACTIONS</h2>
    <p style="opacity:0.75;font-size:0.88rem;margin:0 0 12px;line-height:1.45;">Top prioritized actions. <code style="background:#1e293b;padding:2px 6px;border-radius:6px;">GET /automation/actions</code> · <code style="background:#1e293b;padding:2px 6px;border-radius:6px;">POST /automation/prepare-message</code> · <code style="background:#1e293b;padding:2px 6px;border-radius:6px;">POST /automation/execute</code></p>
    ${saHtml}
  </section>

  ${cardNext(next)}

  <section style="margin-bottom:22px;">
    <h2 style="font-size:1.05rem;color:#e2e8f0;margin:0 0 8px;">Job memory / context</h2>
    <p style="opacity:0.75;font-size:0.88rem;margin:0 0 12px;line-height:1.45;">Top orders by priority (blockers → ready → production → recent). Store context with <code style="background:#1e293b;padding:2px 6px;border-radius:6px;">POST /orders/add-note</code> (JSON: orderId, text, source).</p>
    ${jmHtml}
  </section>

  <section style="margin-bottom:22px;">
    <h2 style="font-size:1.05rem;color:#fca5a5;margin:0 0 12px;">Payment / deposit blockers</h2>
    ${pbHtml}
  </section>

  <section style="margin-bottom:22px;">
    <h2 style="font-size:1.05rem;color:#f97316;margin:0 0 12px;">Urgent follow-ups</h2>
    ${ufHtml}
  </section>

  <section style="margin-bottom:22px;">
    <h2 style="font-size:1.05rem;color:#4ade80;margin:0 0 12px;">Ready for production</h2>
    ${rfHtml}
  </section>

  <section style="margin-bottom:22px;">
    <h2 style="font-size:1.05rem;color:#fbbf24;margin:0 0 12px;">High-risk / needs clarification</h2>
    ${hrHtml}
  </section>

  <section>
    <h2 style="font-size:1.05rem;color:#93c5fd;margin:0 0 12px;">Production in progress</h2>
    ${progHtml}
  </section>
</body>
</html>`;

  res.type("html").send(html);
});

module.exports = router;
