/**
 * Bundle 7 — GET /ops/today founder command panel (HTML).
 */

const { Router } = require("express");
const { getOpsCommandPanelPayload } = require("../services/alertsService");

const router = Router();

const BTN =
  "display:inline-block;padding:14px 16px;margin:6px 6px 0 0;min-height:48px;line-height:1.2;border-radius:12px;text-decoration:none;font-weight:700;font-size:0.95rem;text-align:center;border:1px solid #333;background:#1a1a1a;color:#f0ff44;";

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function urgencyStyle(label) {
  const u = String(label || "").toUpperCase();
  if (u === "CRITICAL") return "color:#ff5252;font-weight:800;";
  if (u === "HIGH") return "color:#ff9800;font-weight:800;";
  return "color:#fff176;font-weight:700;";
}

function followupVisualPriority(p) {
  const x = String(p || "").toLowerCase();
  if (x === "critical") return "CRITICAL";
  if (x === "high") return "HIGH";
  return "ATTENTION";
}

function cashVisualLabel(daysOld) {
  return (Number(daysOld) || 0) > 14 ? "HIGH" : "ATTENTION";
}

function displayName(v) {
  const t = String(v || "").trim();
  return t || "Unknown Customer";
}

function quickLinks() {
  const links = [
    ["/dashboard/next-action", "Next action (JSON)"],
    ["/revenue/auto-followups", "Auto follow-ups"],
    ["/production/queue", "Production queue"],
    ["/alerts/today", "Alerts (JSON)"],
  ];
  const parts = links.map(
    ([href, label]) =>
      `<a href="${esc(href)}" style="${BTN}">${esc(label)}</a>`
  );
  return `<div style="display:flex;flex-wrap:wrap;margin:0 -6px 16px -6px;">${parts.join(
    ""
  )}</div>`;
}

function summaryStrip(alerts) {
  const s = alerts && alerts.summary ? alerts.summary : {};
  const u = Number(s.urgentFollowupCount) || 0;
  const c = Number(s.cashAlertCount) || 0;
  const p = Number(s.productionAlertCount) || 0;
  const chip =
    "display:inline-block;padding:12px 16px;margin:4px 8px 4px 0;border-radius:12px;background:#1a1d24;border:1px solid #333;font-size:0.95rem;min-height:48px;line-height:1.3;";
  return `
  <section style="margin-bottom:20px;">
    <h2 style="font-size:1rem;margin:0 0 10px;color:#9ee7ff;text-transform:uppercase;letter-spacing:0.06em;">Today alert summary</h2>
    <div style="display:flex;flex-wrap:wrap;align-items:center;">
      <span style="${chip}"><strong style="color:#ff5252;">${u}</strong> urgent follow-ups</span>
      <span style="${chip}"><strong style="color:#ff9800;">${c}</strong> cash alerts</span>
      <span style="${chip}"><strong style="color:#fff176;">${p}</strong> production alerts</span>
    </div>
  </section>`;
}

function cardNextAction(next) {
  const t = next && next.target ? next.target : {};
  const name = displayName(t.name);
  const phoneRaw = String(t.phone || "").replace(/\s/g, "");
  const phoneHtml = phoneRaw
    ? `<a href="tel:${esc(phoneRaw)}" style="${BTN}background:#f0ff44;color:#0a0a0a;border:none;">Call</a>`
    : "";
  const em = String(t.email || "").trim();
  const emailHtml = em
    ? `<a href="mailto:${esc(em)}" style="${BTN}">Email</a>`
    : "";
  return `
  <section style="margin-bottom:24px;">
    <h2 style="font-size:1.12rem;margin:0 0 12px;color:#f0ff44;">Next best action</h2>
    <div style="background:#1a1a12;border-radius:16px;padding:20px;border:2px solid #f0ff44;">
      <div style="font-size:1.2rem;font-weight:800;margin-bottom:10px;line-height:1.3;">${esc(
        next.action || ""
      )}</div>
      <div style="opacity:0.9;font-size:0.98rem;margin-bottom:12px;">${esc(
        next.reason || ""
      )}</div>
      <div style="font-weight:700;font-size:1.05rem;">${esc(name)}</div>
      <div style="margin-top:12px;">${phoneHtml}${emailHtml}</div>
    </div>
  </section>`;
}

function cardUrgentFollowup(f) {
  const viz = followupVisualPriority(f.priority);
  const name = displayName(f.customerName);
  const phoneRaw = String(f.phone || "").replace(/\s/g, "");
  const phoneHtml = phoneRaw
    ? `<a href="tel:${esc(phoneRaw)}" style="color:#f0ff44;font-weight:700;font-size:1.05rem;">${esc(
        f.phone
      )}</a>`
    : `<span style="opacity:0.5;">—</span>`;
  const em = String(f.email || "").trim();
  const emailHtml = em
    ? `<a href="mailto:${esc(em)}" style="color:#f0ff44;font-weight:700;word-break:break-all;">${esc(
        em
      )}</a>`
    : `<span style="opacity:0.5;">—</span>`;
  const amt = Number(f.amount) || 0;
  return `
  <div style="background:#1a1a1a;border-radius:16px;padding:18px;margin-bottom:12px;border:1px solid #333;">
    <div style="font-size:0.75rem;letter-spacing:0.08em;${urgencyStyle(
      viz
    )}">${esc(viz)}</div>
    <div style="font-weight:800;font-size:1.1rem;margin-top:8px;">${esc(
      name
    )}</div>
    <div style="margin-top:10px;font-size:1.02rem;">$${esc(
      String(Math.round(amt))
    )} · ${esc(String(f.daysOld ?? ""))} days old</div>
    <div style="margin-top:12px;line-height:1.6;">${phoneHtml}</div>
    <div style="margin-top:6px;">${emailHtml}</div>
  </div>`;
}

function cardCashAlert(c) {
  const viz = cashVisualLabel(c.daysOld);
  const name = displayName(c.customerName);
  const phoneRaw = String(c.phone || "").replace(/\s/g, "");
  const phoneHtml = phoneRaw
    ? `<a href="tel:${esc(phoneRaw)}" style="color:#f0ff44;font-weight:700;">${esc(
        c.phone
      )}</a>`
    : `<span style="opacity:0.5;">—</span>`;
  const em = String(c.email || "").trim();
  const emailHtml = em
    ? `<a href="mailto:${esc(em)}" style="color:#f0ff44;font-weight:700;word-break:break-all;">${esc(
        em
      )}</a>`
    : `<span style="opacity:0.5;">—</span>`;
  const amt = Number(c.amount) || 0;
  return `
  <div style="background:#1a1a1a;border-radius:16px;padding:18px;margin-bottom:12px;border:1px solid #2a1810;">
    <div style="font-size:0.75rem;letter-spacing:0.08em;${urgencyStyle(
      viz
    )}">${esc(viz)}</div>
    <div style="font-weight:800;font-size:1.05rem;margin-top:8px;">${esc(
      name
    )}</div>
    <div style="opacity:0.85;margin-top:6px;font-size:0.88rem;">${esc(
      c.type || ""
    )}</div>
    <div style="margin-top:10px;font-size:1.02rem;">$${esc(
      String(Math.round(amt))
    )} · ${esc(String(c.daysOld ?? ""))} days</div>
    <div style="margin-top:12px;">${phoneHtml}</div>
    <div style="margin-top:6px;">${emailHtml}</div>
  </div>`;
}

function cardProductionAlert(a) {
  const viz = String(a.urgencyLabel || "ATTENTION").toUpperCase();
  return `
  <div style="background:#1a1a1a;border-radius:16px;padding:18px;margin-bottom:12px;border:1px solid #1e2a1e;">
    <div style="font-size:0.75rem;letter-spacing:0.08em;${urgencyStyle(
      viz
    )}">${esc(viz)}</div>
    <div style="font-weight:800;font-size:1.05rem;margin-top:8px;">${esc(
      displayName(a.customerName)
    )}</div>
    <div style="margin-top:8px;font-size:0.95rem;opacity:0.9;">${esc(
      a.product || ""
    )} × ${esc(String(a.quantity ?? 0))}</div>
    <div style="margin-top:6px;font-size:0.92rem;">Print: ${esc(
      a.printType || "—"
    )}</div>
    <div style="margin-top:6px;font-size:0.92rem;">Due: ${esc(
      a.dueDate || "—"
    )}</div>
    <div style="margin-top:6px;font-size:0.88rem;opacity:0.85;">${esc(
      a.alertReason || ""
    )} · <strong>${esc(a.status || "")}</strong></div>
  </div>`;
}

function cardQueueRow(item, statusLabel) {
  return `
  <div style="background:#141414;border-radius:14px;padding:16px;margin-bottom:10px;border:1px solid #2a2a2a;">
    <div style="font-size:0.72rem;color:#8b9dc3;margin-bottom:6px;">${esc(
      statusLabel
    )}</div>
    <div style="font-weight:800;font-size:1.05rem;">${esc(
      displayName(item.customerName)
    )}</div>
    <div style="margin-top:8px;font-size:0.98rem;">${esc(
      item.product || ""
    )} × ${esc(String(item.quantity ?? 0))}</div>
    <div style="margin-top:6px;font-size:0.92rem;">Print: ${esc(
      item.printType || "—"
    )}</div>
    <div style="margin-top:6px;font-size:0.92rem;">Due: ${esc(
      item.dueDate || "—"
    )}</div>
  </div>`;
}

function sectionQueue(title, emoji, items, statusLabel) {
  const list = Array.isArray(items) ? items : [];
  const inner = list.length
    ? list.map((it) => cardQueueRow(it, statusLabel)).join("")
    : `<p style="opacity:0.55;margin:8px 0;">None right now.</p>`;
  return `
  <section style="margin-bottom:22px;">
    <h2 style="font-size:1.12rem;margin:0 0 12px;color:#f0ff44;">${emoji} ${esc(
    title
  )}</h2>
    ${inner}
  </section>`;
}

router.get("/today", async (_req, res) => {
  let payload;
  try {
    payload = await getOpsCommandPanelPayload();
  } catch (err) {
    console.error("[ops/today]", err.message || err);
    payload = {
      alerts: {
        urgentFollowups: [],
        productionAlerts: [],
        cashAlerts: [],
        summary: {
          urgentFollowupCount: 0,
          productionAlertCount: 0,
          cashAlertCount: 0,
        },
      },
      next: {
        action: "No urgent sales actions — proceed to production",
        type: "production",
        target: { name: "", phone: "", email: "", id: "" },
        reason: "Unable to load panel",
      },
      queue: { ready: [], printing: [], qc: [] },
    };
  }

  const { alerts, next, queue } = payload;
  const uf = alerts.urgentFollowups || [];
  const cash = alerts.cashAlerts || [];
  const prodA = alerts.productionAlerts || [];

  const urgentHtml = uf.length
    ? uf.map(cardUrgentFollowup).join("")
    : `<p style="opacity:0.55;">No high/critical scored follow-ups right now.</p>`;
  const cashHtml = cash.length
    ? cash.map(cardCashAlert).join("")
    : `<p style="opacity:0.55;">No cash alerts over 7 days.</p>`;
  const prodHtml = prodA.length
    ? prodA.map(cardProductionAlert).join("")
    : `<p style="opacity:0.55;">No production alerts.</p>`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"/>
  <title>Cheeky — Ops Today</title>
</head>
<body style="margin:0;padding:16px;padding-bottom:max(24px,env(safe-area-inset-bottom));font-family:system-ui,-apple-system,sans-serif;background:#0a0a0a;color:#e8e8e8;max-width:560px;margin-left:auto;margin-right:auto;">
  <h1 style="font-size:1.45rem;margin:8px 0 6px;color:#f0ff44;">Founder command panel</h1>
  <p style="opacity:0.78;margin:0 0 14px;font-size:0.95rem;">Cheeky Tees — today at a glance. Large tap targets; links open JSON or lists where noted.</p>

  ${quickLinks()}
  ${cardNextAction(next)}
  ${summaryStrip(alerts)}

  <section style="margin-bottom:22px;">
    <h2 style="font-size:1.12rem;margin:0 0 12px;color:#ff6b6b;">Urgent follow-ups</h2>
    ${urgentHtml}
  </section>

  <section style="margin-bottom:22px;">
    <h2 style="font-size:1.12rem;margin:0 0 12px;color:#ff9800;">Cash alerts</h2>
    ${cashHtml}
  </section>

  <section style="margin-bottom:22px;">
    <h2 style="font-size:1.12rem;margin:0 0 12px;color:#fff176;">Production alerts</h2>
    ${prodHtml}
  </section>

  ${sectionQueue("Production ready", "🔴", queue.ready, "READY")}
  ${sectionQueue("Printing", "🟡", queue.printing, "PRINTING")}
  ${sectionQueue("QC", "🟢", queue.qc, "QC")}
</body>
</html>`;

  res.type("html").send(html);
});

module.exports = router;
