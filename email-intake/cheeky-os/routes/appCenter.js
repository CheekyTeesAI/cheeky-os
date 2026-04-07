/**
 * Bundle UI — GET /app — mobile command center (compose-only; no business logic).
 */

const { Router } = require("express");
const { getCopilotTodayPayload } = require("../services/copilotService");
const { getDailySummary } = require("../services/dailySummaryService");
const { collectAutomationActions } = require("../services/automationActionsService");
const { getActiveAlertsSorted } = require("../services/alertStoreService");
const { getRevenueFollowups } = require("../services/revenueFollowups");
const { scoreFollowupOpportunities } = require("../services/followupScoringService");
const { getProductionQueue } = require("../services/orderStatusEngine");
const { prepareMessage } = require("../services/messagePrepService");
const { runSystemCheck } = require("../services/systemCheckService");

const router = Router();

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function normalizeName(s) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

/**
 * @param {string} name
 * @param {{ unpaidInvoices?: object[], staleEstimates?: object[] }} rev
 */
function rowMatchName(name, rev) {
  const want = normalizeName(name);
  if (!want) return null;
  const rows = [
    ...(Array.isArray(rev.unpaidInvoices) ? rev.unpaidInvoices : []),
    ...(Array.isArray(rev.staleEstimates) ? rev.staleEstimates : []),
  ];
  for (const r of rows) {
    if (!r || typeof r !== "object") continue;
    const rn = normalizeName(/** @type {{customerName?:string}} */ (r).customerName);
    if (!rn) continue;
    if (want === rn || want.includes(rn) || rn.includes(want)) {
      return /** @type {{customerId?:string,phone?:string}} */ (r);
    }
  }
  return null;
}

function squareCustomerIdForName(name, rev) {
  const hit = rowMatchName(name, rev);
  return hit && hit.customerId ? String(hit.customerId).trim() : "";
}

function phoneForFollowupName(name, rev) {
  const hit = rowMatchName(name, rev);
  return hit && hit.phone ? String(hit.phone).replace(/\s/g, "") : "";
}

function sevColor(sev) {
  const u = String(sev || "").toUpperCase();
  if (u === "CRITICAL") return "#ef4444";
  if (u === "HIGH") return "#f97316";
  if (u === "MEDIUM") return "#fde047";
  return "#94a3b8";
}

const CARD =
  "background:#141414;border:1px solid #2a2a2a;border-radius:8px;padding:14px 16px;margin:8px 0;box-shadow:0 2px 8px rgba(0,0,0,0.35);";
const H2 =
  "font-size:1.15rem;font-weight:800;margin:20px 0 10px;color:#f0ff44;letter-spacing:0.02em;";
const BTN_FULL =
  "display:block;width:100%;box-sizing:border-box;min-height:48px;padding:14px 16px;margin-top:10px;border-radius:8px;font-weight:800;font-size:1rem;border:1px solid #f0ff44;background:#f0ff44;color:#0a0a0a;text-align:center;text-decoration:none;cursor:pointer;";
const BTN_SEC =
  "display:block;width:100%;box-sizing:border-box;min-height:48px;padding:14px 16px;margin-top:10px;border-radius:8px;font-weight:700;font-size:0.95rem;border:1px solid #444;background:#1a1a1a;color:#e8e8e8;text-align:center;text-decoration:none;cursor:pointer;";

router.get("/app", async (req, res) => {
  if (String(req.query.refresh || "") === "1") {
    try {
      await runSystemCheck();
    } catch (err) {
      console.error("[app] refresh runSystemCheck", err.message || err);
    }
  }

  let copilot = { message: "", topActions: [] };
  let summary = { counts: {}, highlights: {} };
  let actions = [];
  let alerts = [];
  /** @type {{ unpaidInvoices?: object[], staleEstimates?: object[] }} */
  let rev = { unpaidInvoices: [], staleEstimates: [] };
  let followupRows = [];
  let queue = { ready: [], printing: [], qc: [] };

  try {
    const [cp, sum, actPack, revenue, q] = await Promise.all([
      getCopilotTodayPayload(),
      getDailySummary(),
      collectAutomationActions(10),
      getRevenueFollowups(),
      getProductionQueue(),
    ]);
    copilot = cp || copilot;
    summary = sum || summary;
    actions = (actPack && actPack.actions) || [];
    rev = revenue || rev;
    queue = q || queue;
  } catch (err) {
    console.error("[app] data load", err.message || err);
  }

  try {
    const scored = scoreFollowupOpportunities(
      rev.unpaidInvoices || [],
      rev.staleEstimates || []
    );
    const metaById = new Map();
    for (const r of rev.unpaidInvoices || []) {
      if (r && r.id) metaById.set(String(r.id), r);
    }
    for (const r of rev.staleEstimates || []) {
      if (r && r.id) metaById.set(String(r.id), r);
    }
    followupRows = scored.slice(0, 6).map((s) => {
      const base = metaById.get(s.id) || {};
      const phone = String(
        (base && base.phone) || s.phone || ""
      ).trim();
      const customerId = String(
        (base && base.customerId) || ""
      ).trim();
      let smsText = "";
      try {
        const prep = prepareMessage({
          type: s.type === "invoice" ? "invoice" : "followup",
          customerName: s.customerName,
          amount: s.amount,
          daysOld: s.daysOld,
        });
        smsText = prep.message || "";
      } catch (_) {}
      return { ...s, phone, customerId, smsText };
    });
  } catch (err) {
    console.error("[app] followups", err.message || err);
  }

  try {
    alerts = getActiveAlertsSorted().slice(0, 6);
  } catch (_) {
    alerts = [];
  }

  const counts = summary.counts || {};
  const hl = summary.highlights || {};
  const summaryLines = [
    String(hl.topAction || "").trim(),
    String(hl.topCustomer || "").trim(),
    String(hl.biggestOpportunity || "").trim(),
  ].filter(Boolean);

  const copilotMsg = String(copilot.message || "").trim()
    || "Review summary and actions below.";

  const copilotHtml = `
  <section style="${CARD}">
    <h2 style="font-size:1rem;font-weight:800;margin:0 0 12px;color:#f0ff44;">🧠 COPILOT SAYS</h2>
    <p style="margin:0;font-size:1.05rem;line-height:1.5;color:#e8e8e8;font-weight:600;">${esc(
      copilotMsg
    )}</p>
  </section>`;

  const summaryCountBits = [
    counts.urgentFollowups != null
      ? `Urgent follow-ups: ${esc(String(counts.urgentFollowups))}`
      : "",
    counts.readyToPrint != null
      ? `Ready to print: ${esc(String(counts.readyToPrint))}`
      : "",
    counts.inProduction != null
      ? `In production: ${esc(String(counts.inProduction))}`
      : "",
    counts.blockedOrders != null
      ? `Blocked: ${esc(String(counts.blockedOrders))}`
      : "",
  ].filter(Boolean);

  const summaryHtml = `
  <section style="${CARD}">
    <h2 style="${H2}">📊 TODAY SUMMARY</h2>
    <div style="font-size:0.95rem;line-height:1.55;color:#ccc;">
      ${summaryCountBits.map((l) => `<p style="margin:6px 0;">${l}</p>`).join("")}
      ${summaryLines
        .slice(0, 2)
        .map(
          (t) =>
            `<p style="margin:8px 0 0;font-size:0.98rem;line-height:1.45;color:#e8e8e8;">${esc(
              t.length > 120 ? t.slice(0, 117) + "…" : t
            )}</p>`
        )
        .join("")}
    </div>
  </section>`;

  const actionsHtml =
    actions.length === 0
      ? `<section style="${CARD}"><h2 style="${H2}">🚀 SYSTEM ACTIONS</h2><p style="margin:0;opacity:0.7;">No queued actions.</p></section>`
      : `<section style="${CARD}">
    <h2 style="${H2}">🚀 SYSTEM ACTIONS</h2>
    ${actions
      .map((a, idx) => {
        if (!a || typeof a !== "object") return "";
        const label = esc(String(a.label || "").trim() || "Action");
        const reason = esc(
          String(a.reason || "").trim().slice(0, 120)
        );
        const pri = esc(String(a.priority || "").toUpperCase());
        const pcol = sevColor(pri);
        const oid = esc(String(a.orderId || "").trim());
        const cn = String(a.customerName || "").trim();
        const cid = squareCustomerIdForName(cn, rev);
        const amt = Number(a.amount) || 0;
        const daysOld = Number(a.daysOld) || 0;
        const typ = String(a.type || "").toLowerCase();
        let script = "";
        try {
          const pr = prepareMessage({
            type: typ === "invoice" ? "invoice" : "followup",
            customerName: cn,
            amount: amt,
            daysOld,
          });
          script = pr.message || "";
        } catch (_) {}
        const phoneRaw = phoneForFollowupName(cn, rev);
        const tel = phoneRaw
          ? `<a href="tel:${esc(phoneRaw)}" style="${BTN_FULL}">Call</a>`
          : "";
        const textArea = script
          ? `<label style="display:block;font-size:0.75rem;opacity:0.75;margin-top:10px;">Text (copy)</label><textarea readonly rows="3" style="width:100%;box-sizing:border-box;margin-top:4px;padding:10px;border-radius:8px;border:1px solid #333;background:#0f0f0f;color:#e8e8e8;font-size:0.95rem;">${esc(
              script
            )}</textarea>`
          : "";
        let invoiceBtn = "";
        if (typ === "invoice" && cid && amt > 0) {
          const payloadAttr = esc(
            JSON.stringify({
              amount: amt,
              description: cn.slice(0, 200),
            })
          );
          invoiceBtn = `<form class="app-exec-form" style="margin:0;">
            <input type="hidden" name="approved" value="true"/>
            <input type="hidden" name="actionType" value="invoice"/>
            <input type="hidden" name="orderId" value="${oid}"/>
            <input type="hidden" name="customerId" value="${esc(cid)}"/>
            <input type="hidden" name="payload" value="${payloadAttr}"/>
            <button type="submit" style="${BTN_FULL}">Invoice</button>
          </form>`;
        }
        let printBtn = "";
        if (typ === "production" && oid) {
          printBtn = `<form class="app-status-form" style="margin:0;">
            <input type="hidden" name="orderId" value="${oid}"/>
            <input type="hidden" name="status" value="PRINTING"/>
            <button type="submit" style="${BTN_SEC}">Start Print</button>
          </form>`;
        }
        const sep =
          idx > 0
            ? "border-top:1px solid #2a2a2a;padding-top:12px;margin-top:12px;"
            : "padding-top:0;margin-top:0;";
        return `<div style="${sep}">
          <div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start;">
            <strong style="font-size:1.02rem;line-height:1.3;color:#f3f3f3;">${label}</strong>
            <span style="font-size:0.7rem;font-weight:800;color:${pcol};white-space:nowrap;">${pri}</span>
          </div>
          <p style="margin:8px 0 0;font-size:0.9rem;line-height:1.4;opacity:0.85;color:#ccc;">${reason}</p>
          <p style="margin:6px 0 0;font-size:0.88rem;color:#888;">${esc(
            cn || "—"
          )}</p>
          ${tel}
          ${textArea}
          ${invoiceBtn}
          ${printBtn}
        </div>`;
      })
      .filter(Boolean)
      .join("")}
  </section>`;

  const alertsHtml =
    alerts.length === 0
      ? `<section style="${CARD}"><h2 style="${H2}">🚨 ACTIVE ALERTS</h2><p style="margin:0;opacity:0.7;">None.</p></section>`
      : `<section style="${CARD}">
    <h2 style="${H2}">🚨 ACTIVE ALERTS</h2>
    ${alerts
      .map((a) => {
        if (!a || typeof a !== "object") return "";
       const msg = esc(
          String(/** @type {{message?:string}} */ (a).message || "").trim()
        );
       const sev = String(
          /** @type {{severity?:string}} */ (a).severity || ""
        ).toUpperCase();
       const col = sevColor(sev);
       const line = msg.length > 140 ? msg.slice(0, 137) + "…" : msg;
       return `<div style="margin-top:10px;padding:12px;border-radius:8px;border:1px solid #333;background:#101010;">
          <div style="display:flex;justify-content:space-between;gap:8px;">
            <span style="font-size:0.95rem;line-height:1.35;color:#eee;">${line}</span>
            <span style="font-size:0.65rem;font-weight:800;color:${col};">${esc(sev)}</span>
          </div>
        </div>`;
      })
      .join("")}
  </section>`;

  const followHtml =
    followupRows.length === 0
      ? `<section style="${CARD}"><h2 style="${H2}">💸 FOLLOW-UPS</h2><p style="margin:0;opacity:0.7;">No scored follow-ups.</p></section>`
      : `<section style="${CARD}">
    <h2 style="${H2}">💸 FOLLOW-UPS</h2>
    ${followupRows
      .map((u) => {
        const name = esc(String(u.customerName || "").trim() || "—");
        const pri = esc(String(u.priority || "").toUpperCase());
        const pcol = sevColor(pri);
        const phone = String(u.phone || "").replace(/\s/g, "");
        const tel = phone
          ? `<a href="tel:${esc(phone)}" style="${BTN_FULL}">Call</a>`
          : "";
        const sms = String(u.smsText || "").trim();
        const textBlock = sms
          ? `<textarea readonly rows="3" style="width:100%;box-sizing:border-box;margin-top:8px;padding:10px;border-radius:8px;border:1px solid #333;background:#0f0f0f;color:#e8e8e8;font-size:0.95rem;">${esc(
              sms
            )}</textarea>`
          : "";
        const cid = String(u.customerId || "").trim();
        const amt = Number(u.amount) || 0;
        let invForm = "";
        if (cid && amt > 0) {
          const payloadAttr = esc(
            JSON.stringify({
              amount: amt,
              description: String(u.customerName || "Order").slice(0, 200),
            })
          );
          invForm = `<form class="app-exec-form" style="margin-top:8px;">
            <input type="hidden" name="approved" value="true"/>
            <input type="hidden" name="actionType" value="invoice"/>
            <input type="hidden" name="orderId" value=""/>
            <input type="hidden" name="customerId" value="${esc(cid)}"/>
            <input type="hidden" name="payload" value="${payloadAttr}"/>
            <button type="submit" style="${BTN_SEC}">Invoice</button>
          </form>`;
        }
        return `<div style="margin-top:12px;padding-bottom:12px;border-bottom:1px solid #2a2a2a;">
          <strong style="font-size:1.02rem;">${name}</strong>
          <div style="font-size:0.72rem;font-weight:800;margin-top:6px;color:${pcol};">${pri}</div>
          <p style="margin:8px 0 0;font-size:0.92rem;">$${esc(
            String(Math.round(Number(u.amount) || 0))
          )} · ${esc(String(u.daysOld ?? ""))}d</p>
          ${tel}
          ${textBlock}
          ${invForm}
        </div>`;
      })
      .join("")}
  </section>`;

  function prodCard(item, sectionStatus) {
    const id = esc(item.orderId);
    const cust = esc(item.customerName || "—");
    const prod = esc(item.product || "—");
    const qty = Number(item.quantity) || 0;
    const due = esc(item.dueDate || "—");
    let next = "";
    let btnLabel = "";
    if (sectionStatus === "READY") {
      next = "PRINTING";
      btnLabel = "Start Print";
    } else if (sectionStatus === "PRINTING") {
      next = "QC";
      btnLabel = "Move to QC";
    } else if (sectionStatus === "QC") {
      next = "DONE";
      btnLabel = "QC Done";
    }
    const badgeColor =
      sectionStatus === "READY"
        ? "#22c55e"
        : sectionStatus === "PRINTING"
          ? "#f97316"
          : "#fde047";
    const btn =
      next &&
      `<form class="app-status-form" style="margin-top:10px;">
        <input type="hidden" name="orderId" value="${id}"/>
        <input type="hidden" name="status" value="${next}"/>
        <button type="submit" style="${BTN_FULL}">${esc(btnLabel)}</button>
      </form>`;
    return `<div style="margin-top:10px;padding:14px;border-radius:8px;border:1px solid #333;background:#101010;">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
        <strong style="font-size:1.02rem;line-height:1.3;">${cust}</strong>
        <span style="font-size:0.65rem;font-weight:800;padding:4px 8px;border-radius:6px;background:#1a1a1a;color:${badgeColor};">${esc(
      sectionStatus
    )}</span>
      </div>
      <p style="margin:8px 0 0;font-size:0.9rem;opacity:0.88;line-height:1.35;">${prod} × ${qty}</p>
      <p style="margin:4px 0 0;font-size:0.85rem;opacity:0.7;">Due ${due}</p>
      ${btn || ""}
    </div>`;
  }

  const prodHtml = `
  <section style="${CARD}">
    <h2 style="${H2}">🖨 PRODUCTION</h2>
    <p style="margin:0 0 8px;font-size:0.85rem;opacity:0.75;">READY · PRINTING · QC</p>
    ${queue.ready && queue.ready.length
      ? queue.ready.map((it) => prodCard(it, "READY")).join("")
      : ""}
    ${queue.printing && queue.printing.length
      ? queue.printing.map((it) => prodCard(it, "PRINTING")).join("")
      : ""}
    ${queue.qc && queue.qc.length
      ? queue.qc.map((it) => prodCard(it, "QC")).join("")
      : ""}
    ${(!queue.ready || !queue.ready.length) &&
    (!queue.printing || !queue.printing.length) &&
    (!queue.qc || !queue.qc.length)
      ? '<p style="opacity:0.65;margin:8px 0 0;">Queue empty.</p>'
      : ""}
  </section>`;

  const topBar = `
  <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:16px;">
    <a href="/app?refresh=1" style="flex:1;min-width:100px;text-align:center;${BTN_SEC}margin-top:0;">Refresh</a>
    <button type="button" id="app-send-alerts" style="flex:1;min-width:100px;${BTN_SEC.replace(
      "margin-top:10px",
      "margin-top:0"
    )}">Send Alerts</button>
    <button type="button" id="app-send-sms" style="flex:1;min-width:100px;${BTN_SEC.replace(
      "margin-top:10px",
      "margin-top:0"
    )}">Send SMS</button>
  </div>
  <p id="app-notify-msg" style="font-size:0.82rem;opacity:0.8;min-height:1.2em;"></p>`;

  const script = `
  <script>
  (function(){
    function msg(t){ var m=document.getElementById('app-notify-msg'); if(m) m.textContent=t||''; }
    document.getElementById('app-send-alerts') && document.getElementById('app-send-alerts').addEventListener('click',function(){
      msg('Sending…');
      fetch('/notifications/send-alerts',{method:'POST'}).then(function(r){return r.json();}).then(function(j){
        msg(j.sent?(('Sent '+j.count+' alert(s)')):(j.message||j.error||'Done'));
      }).catch(function(){ msg('Failed'); });
    });
    document.getElementById('app-send-sms') && document.getElementById('app-send-sms').addEventListener('click',function(){
      msg('Sending…');
      fetch('/notifications/send-sms',{method:'POST'}).then(function(r){return r.json();}).then(function(j){
        msg(j.sent?(('SMS batch ok')):(j.message||j.error||'Done'));
      }).catch(function(){ msg('Failed'); });
    });
    function postJSON(url, body){
      return fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})
        .then(function(r){return r.json();});
    }
    document.querySelectorAll('form.app-status-form').forEach(function(f){
      f.addEventListener('submit',function(ev){
        ev.preventDefault();
        var fd=new FormData(f);
        var orderId=fd.get('orderId'); var status=fd.get('status');
        var btn=f.querySelector('button[type="submit"]'); if(btn) btn.disabled=true;
        postJSON('/orders/update-status',{orderId:orderId,status:status}).then(function(d){
          if(d&&d.success) location.reload();
          else { msg(d&&d.error||d&&d.reason||'Status blocked'); if(btn) btn.disabled=false; }
        }).catch(function(){ msg('Network error'); if(btn) btn.disabled=false; });
      });
    });
    document.querySelectorAll('form.app-exec-form').forEach(function(f){
      f.addEventListener('submit',function(ev){
        ev.preventDefault();
        var fd=new FormData(f);
        var payload={}; try{ payload=JSON.parse(fd.get('payload')||'{}'); }catch(e){}
        var body={
          approved:fd.get('approved')==='true',
          actionType:fd.get('actionType'),
          orderId:fd.get('orderId')||'',
          customerId:fd.get('customerId')||'',
          payload:payload
        };
        var btn=f.querySelector('button[type="submit"]'); if(btn) btn.disabled=true;
        postJSON('/automation/execute',body).then(function(d){
          if(d&&d.success) { msg('OK'); location.reload(); }
          else { msg((d&&d.error)||'Execute failed'); if(btn) btn.disabled=false; }
        }).catch(function(){ msg('Network error'); if(btn) btn.disabled=false; });
      });
    });
  })();
  </script>`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover"/>
  <meta name="theme-color" content="#0a0a0a"/>
  <title>Command Center — Cheeky</title>
</head>
<body style="margin:0;padding:14px;padding-bottom:max(24px,env(safe-area-inset-bottom));font-family:system-ui,-apple-system,sans-serif;background:#0a0a0a;color:#e8e8e8;max-width:520px;margin-left:auto;margin-right:auto;">
  <h1 style="font-size:1.35rem;margin:8px 0 4px;color:#f0ff44;font-weight:900;">Cheeky Tees</h1>
  <p style="margin:0 0 12px;font-size:0.92rem;opacity:0.75;">Command Center</p>
  ${topBar}
  ${copilotHtml}
  ${summaryHtml}
  ${actionsHtml}
  ${alertsHtml}
  ${followHtml}
  ${prodHtml}
  ${script}
</body>
</html>`;

  res.type("html").send(html);
});

module.exports = router;
