/**
 * Bundle 11 — GET /founder/today
 */

const { Router } = require("express");
const { getFounderDashboardPayload } = require("../services/founderTodayService");

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
      paymentBlockers: [],
      urgentFollowups: [],
      readyForProduction: [],
      highRisk: [],
      queue: { ready: [], printing: [], qc: [] },
    };
  }

  const next = data.next || {};
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

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"/>
  <title>Founder — Today</title>
</head>
<body style="margin:0;padding:16px;padding-bottom:max(28px,env(safe-area-inset-bottom));font-family:system-ui,-apple-system,sans-serif;background:#0a0c10;color:#e8eaed;max-width:560px;margin-left:auto;margin-right:auto;">
  <h1 style="font-size:1.5rem;margin:8px 0 6px;color:#7dd3fc;">Founder — Today</h1>
  <p style="opacity:0.85;margin:0 0 14px;font-size:0.95rem;">Daily command board</p>

  <div style="display:flex;flex-wrap:wrap;margin:0 -4px 18px -4px;">
    <a href="/ops/today" style="${BTN}">Ops</a>
    <a href="/dashboard/today/mobile" style="${BTN}">Sales mobile</a>
    <a href="/production/mobile" style="${BTN}">Production</a>
    <a href="/capture/founder" style="${BTN}">Brief workbench</a>
  </div>

  ${cardNext(next)}

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
