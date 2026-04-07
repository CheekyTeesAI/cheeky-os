/**
 * Bundle 1 — mobile HTML dashboard (inline styles only).
 */

const { Router } = require("express");
const { getReactivationBuckets } = require("../services/reactivationBuckets");
const { getRevenueFollowups } = require("../services/revenueFollowups");

const router = Router();

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function cardCustomer(c) {
  const tel = (c.phone || "").replace(/\s/g, "");
  const phoneHtml = tel
    ? `<a href="tel:${esc(tel)}" style="color:#f0ff44;font-size:1.1rem;display:inline-block;padding:12px 0;min-height:44px;line-height:44px;">${esc(c.phone)}</a>`
    : `<span style="opacity:0.6;">—</span>`;
  return `
    <div style="background:#1a1a1a;border-radius:12px;padding:16px;margin-bottom:12px;border:1px solid #2a2a2a;">
      <div style="font-weight:700;font-size:1.05rem;margin-bottom:8px;">${esc(c.name) || "Customer"}</div>
      ${phoneHtml}
      <div style="margin-top:8px;font-size:0.9rem;opacity:0.85;">Last order: ${esc(c.lastOrder) || "—"}</div>
      <div style="font-size:0.9rem;opacity:0.85;">Amount: ${esc(c.amount) || "—"}</div>
    </div>`;
}

function cardInvoice(i) {
  return `
    <div style="background:#1a1a1a;border-radius:12px;padding:16px;margin-bottom:12px;border:1px solid #2a2a2a;">
      <div style="font-weight:700;">${esc(i.customerName)}</div>
      <div style="margin-top:6px;">$${esc(i.amount)} · Due: ${esc(i.dueDate)} (${esc(String(i.daysPastDue))}d)</div>
    </div>`;
}

function cardStale(e) {
  return `
    <div style="background:#1a1a1a;border-radius:12px;padding:16px;margin-bottom:12px;border:1px solid #2a2a2a;">
      <div style="font-weight:700;">${esc(e.customerName)}</div>
      <div style="margin-top:6px;">$${esc(e.amount)} · ${esc(e.createdAt)} (${esc(String(e.daysOld))}d old)</div>
    </div>`;
}

router.get("/dashboard/today/mobile", async (_req, res) => {
  let hot = [];
  let warm = [];
  let cold = [];
  let unpaidInvoices = [];
  let staleEstimates = [];

  try {
    const buckets = await getReactivationBuckets();
    hot = buckets.hot || [];
    warm = buckets.warm || [];
    cold = buckets.cold || [];
  } catch (err) {
    console.error("[mobileDashboard] reactivation load failed:", err.message || err);
  }

  try {
    const fu = await getRevenueFollowups();
    unpaidInvoices = fu.unpaidInvoices || [];
    staleEstimates = fu.staleEstimates || [];
  } catch (err) {
    console.error("[mobileDashboard] followups load failed:", err.message || err);
  }

  const hotHtml = hot.length ? hot.map(cardCustomer).join("") : `<p style="opacity:0.6;">No customers in this bucket.</p>`;
  const warmHtml = warm.length ? warm.map(cardCustomer).join("") : `<p style="opacity:0.6;">No customers in this bucket.</p>`;
  const coldHtml = cold.length ? cold.map(cardCustomer).join("") : `<p style="opacity:0.6;">No customers in this bucket.</p>`;
  const invHtml = unpaidInvoices.length
    ? unpaidInvoices.map(cardInvoice).join("")
    : `<p style="opacity:0.6;">No unpaid invoices found.</p>`;
  const estHtml = staleEstimates.length
    ? staleEstimates.map(cardStale).join("")
    : `<p style="opacity:0.6;">No stale open orders.</p>`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1"/>
  <title>Cheeky — Today</title>
</head>
<body style="margin:0;padding:16px;font-family:system-ui,-apple-system,sans-serif;background:#0a0a0a;color:#e8e8e8;max-width:520px;margin-left:auto;margin-right:auto;">
  <h1 style="font-size:1.35rem;margin:8px 0 20px;color:#f0ff44;">Cheeky Tees — Today</h1>

  <section style="margin-bottom:28px;">
    <h2 style="font-size:1.15rem;margin:0 0 12px;color:#f0ff44;">🔥 HOT REACTIVATION</h2>
    ${hotHtml}
  </section>

  <section style="margin-bottom:28px;">
    <h2 style="font-size:1.15rem;margin:0 0 12px;color:#f0ff44;">💸 FOLLOW-UPS NEEDED</h2>
    <h3 style="font-size:1rem;opacity:0.9;margin:16px 0 8px;">Unpaid invoices</h3>
    ${invHtml}
    <h3 style="font-size:1rem;opacity:0.9;margin:16px 0 8px;">Stale estimates</h3>
    ${estHtml}
  </section>

  <section style="margin-bottom:28px;">
    <h2 style="font-size:1.15rem;margin:0 0 12px;color:#f0ff44;">⚠ WARM LEADS</h2>
    ${warmHtml}
  </section>

  <section>
    <details style="margin-top:8px;">
      <summary style="cursor:pointer;font-size:1.1rem;padding:14px 0;min-height:44px;color:#f0ff44;list-style-position:outside;">🚫 COLD (tap to expand)</summary>
      <div style="margin-top:12px;">${coldHtml}</div>
    </details>
  </section>
</body>
</html>`;

  res.type("html").send(html);
});

module.exports = router;
