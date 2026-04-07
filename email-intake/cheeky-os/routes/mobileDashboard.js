/**
 * Bundle 1 — mobile HTML dashboard (inline styles only).
 * Bundle 2.5 — sales-first order, next action, tap targets, script blocks.
 */

const { Router } = require("express");
const { getReactivationBuckets } = require("../services/reactivationBuckets");
const { getRevenueFollowups } = require("../services/revenueFollowups");
const { buildNextAction } = require("../services/nextAction");
const { getScriptSet } = require("../services/scriptTemplates");

const router = Router();

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function displayName(v) {
  const t = String(v || "").trim();
  return t || "Unknown Customer";
}

function fillScript(tpl, name) {
  const n = displayName(name);
  const first = n === "Unknown Customer" ? "there" : n.split(/\s+/)[0] || "there";
  return String(tpl || "").replace(/\[Name\]/g, first);
}

const BTN =
  "display:inline-block;padding:14px 22px;margin:10px 10px 0 0;min-height:48px;line-height:1.2;border-radius:12px;text-decoration:none;font-weight:700;font-size:1.05rem;text-align:center;";

function telBtn(phone) {
  const raw = String(phone || "").replace(/\s/g, "");
  if (!raw) return "";
  return `<a href="tel:${esc(raw)}" style="${BTN}background:#f0ff44;color:#0a0a0a;">Call</a>`;
}

function mailBtn(email) {
  const e = String(email || "").trim();
  if (!e) return "";
  return `<a href="mailto:${esc(e)}" style="${BTN}background:#252525;color:#f0ff44;border:2px solid #f0ff44;">Email</a>`;
}

function scriptBlock(text) {
  if (!text) return "";
  return `
    <div style="margin-top:16px;">
      <div style="font-size:0.78rem;opacity:0.7;margin-bottom:8px;">Suggested text (copy)</div>
      <textarea readonly rows="4" style="width:100%;box-sizing:border-box;background:#0f0f0f;border:1px solid #333;color:#e8e8e8;border-radius:10px;padding:14px;font-size:1rem;line-height:1.45;">${esc(
        text
      )}</textarea>
    </div>`;
}

function cardNextAction(next, scripts) {
  const t = next.target || {};
  const name = displayName(t.name);
  let suggestion = "";
  if (next.type === "outreach") {
    suggestion = fillScript(scripts.reactivation, t.name);
  } else if (next.type === "followup") {
    const a = (next.action || "").toLowerCase();
    if (a.includes("invoice")) {
      suggestion = fillScript(scripts.followup_invoice, t.name);
    } else {
      suggestion = fillScript(scripts.followup_estimate, t.name);
    }
  }
  return `
  <div style="background:#1a1a12;border-radius:16px;padding:20px;margin-bottom:24px;border:2px solid #f0ff44;">
    <div style="font-size:0.72rem;text-transform:uppercase;letter-spacing:0.08em;color:#f0ff44;margin-bottom:10px;">Next best action</div>
    <div style="font-size:1.25rem;font-weight:800;margin-bottom:10px;line-height:1.3;">${esc(
      next.action || ""
    )}</div>
    <div style="opacity:0.88;font-size:0.98rem;margin-bottom:14px;">${esc(next.reason || "")}</div>
    <div style="font-weight:700;font-size:1.08rem;">${esc(name)}</div>
    <div>${telBtn(t.phone)}${mailBtn(t.email)}</div>
    ${scriptBlock(suggestion)}
  </div>`;
}

function cardStale(e, scripts) {
  const name = displayName(e.customerName);
  const suggestion = fillScript(scripts.followup_estimate, e.customerName);
  return `
    <div style="background:#1a1a1a;border-radius:16px;padding:20px;margin-bottom:14px;border:1px solid #333;">
      <div style="font-size:0.72rem;color:#f0ff44;margin-bottom:8px;">Follow up estimate</div>
      <div style="font-weight:800;font-size:1.12rem;">${esc(name)}</div>
      <div style="margin-top:12px;font-size:1.05rem;">$${esc(e.amount)} · ${esc(
    String(e.daysOld)
  )} days old</div>
      <div style="margin-top:14px;">${telBtn(e.phone)}${mailBtn(e.email)}</div>
      ${scriptBlock(suggestion)}
    </div>`;
}

function cardInvoice(i, scripts) {
  const name = displayName(i.customerName);
  const suggestion = fillScript(scripts.followup_invoice, i.customerName);
  return `
    <div style="background:#1a1a1a;border-radius:16px;padding:20px;margin-bottom:14px;border:1px solid #333;">
      <div style="font-size:0.72rem;color:#f0ff44;margin-bottom:8px;">Collect invoice</div>
      <div style="font-weight:800;font-size:1.12rem;">${esc(name)}</div>
      <div style="margin-top:12px;font-size:1.05rem;">$${esc(i.amount)} · ${esc(
    String(i.daysPastDue)
  )} days past due</div>
      <div style="margin-top:14px;">${telBtn(i.phone)}${mailBtn(i.email)}</div>
      ${scriptBlock(suggestion)}
    </div>`;
}

function cardReactivation(c, scripts) {
  const name = displayName(c.name);
  const suggestion = fillScript(scripts.reactivation, c.name);
  const tel = (c.phone || "").replace(/\s/g, "");
  const phoneHtml = tel
    ? `<a href="tel:${esc(tel)}" style="${BTN}background:#f0ff44;color:#0a0a0a;">Call</a>`
    : "";
  const em = String(c.email || "").trim();
  const emailHtml = em
    ? `<a href="mailto:${esc(em)}" style="${BTN}background:#252525;color:#f0ff44;border:2px solid #f0ff44;">Email</a>`
    : "";
  return `
    <div style="background:#1a1a1a;border-radius:16px;padding:20px;margin-bottom:14px;border:1px solid #2a2a2a;">
      <div style="font-weight:800;font-size:1.1rem;">${esc(name)}</div>
      <div style="margin-top:10px;font-size:0.95rem;opacity:0.88;">Last: ${esc(
        c.lastOrder || "—"
      )} · $${esc(c.amount || "—")}</div>
      <div style="margin-top:14px;">${phoneHtml}${emailHtml}</div>
      ${scriptBlock(suggestion)}
    </div>`;
}

router.get("/dashboard/today/mobile", async (_req, res) => {
  const scripts = getScriptSet();
  let hot = [];
  let warm = [];
  let cold = [];
  let unpaidInvoices = [];
  let staleEstimates = [];
  let next = {
    action: "",
    type: "production",
    reason: "",
    target: { name: "", phone: "", email: "", id: "" },
  };

  try {
    const [followups, buckets] = await Promise.all([
      getRevenueFollowups(),
      getReactivationBuckets(),
    ]);
    unpaidInvoices = followups.unpaidInvoices || [];
    staleEstimates = followups.staleEstimates || [];
    hot = buckets.hot || [];
    warm = buckets.warm || [];
    cold = buckets.cold || [];
    next = buildNextAction(followups, buckets);
  } catch (err) {
    console.error("[mobileDashboard] sales data load failed:", err.message || err);
  }

  const nextHtml = cardNextAction(next, scripts);
  const staleHtml = staleEstimates.length
    ? staleEstimates.map((e) => cardStale(e, scripts)).join("")
    : `<p style="opacity:0.6;padding:12px 0;">No stale estimates right now.</p>`;
  const invHtml = unpaidInvoices.length
    ? unpaidInvoices.map((i) => cardInvoice(i, scripts)).join("")
    : `<p style="opacity:0.6;padding:12px 0;">No unpaid invoices in queue.</p>`;
  const hotHtml = hot.length
    ? hot.map((c) => cardReactivation(c, scripts)).join("")
    : `<p style="opacity:0.6;">No hot leads.</p>`;
  const warmHtml = warm.length
    ? warm.map((c) => cardReactivation(c, scripts)).join("")
    : `<p style="opacity:0.6;">No warm leads.</p>`;
  const coldHtml = cold.length
    ? cold.map((c) => cardReactivation(c, scripts)).join("")
    : `<p style="opacity:0.6;">No cold leads.</p>`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1"/>
  <title>Cheeky — Sales</title>
</head>
<body style="margin:0;padding:16px;font-family:system-ui,-apple-system,sans-serif;background:#0a0a0a;color:#e8e8e8;max-width:520px;margin-left:auto;margin-right:auto;">
  <h1 style="font-size:1.4rem;margin:8px 0 8px;color:#f0ff44;">Cheeky Tees — Sales</h1>
  <p style="opacity:0.75;margin:0 0 20px;font-size:0.95rem;">Tonight’s call list — tap Call or Email, copy the script.</p>

  ${nextHtml}

  <section style="margin-bottom:28px;">
    <h2 style="font-size:1.12rem;margin:0 0 14px;color:#f0ff44;">Stale estimates to follow up</h2>
    ${staleHtml}
  </section>

  <section style="margin-bottom:28px;">
    <h2 style="font-size:1.12rem;margin:0 0 14px;color:#f0ff44;">Unpaid invoices</h2>
    ${invHtml}
  </section>

  <section style="margin-bottom:28px;">
    <h2 style="font-size:1.12rem;margin:0 0 14px;color:#f0ff44;">Hot reactivation</h2>
    ${hotHtml}
  </section>

  <section style="margin-bottom:28px;">
    <h2 style="font-size:1.12rem;margin:0 0 14px;color:#f0ff44;">Warm leads</h2>
    ${warmHtml}
  </section>

  <section>
    <details style="margin-top:8px;">
      <summary style="cursor:pointer;font-size:1.12rem;padding:16px 0;min-height:48px;color:#f0ff44;">Cold leads (tap to expand)</summary>
      <div style="margin-top:12px;">${coldHtml}</div>
    </details>
  </section>
</body>
</html>`;

  res.type("html").send(html);
});

module.exports = router;
