/**
 * Bundle 43 — goals status API + dashboard panel HTML.
 */

const { Router } = require("express");
const { getGoalsStatus, updateGoalsTargets, getEffectiveTargets } = require("../services/goalsService");

const router = Router();

router.get("/status", async (_req, res) => {
  try {
    const out = await getGoalsStatus();
    return res.json({
      daily: out.daily || {},
      weekly: out.weekly || {},
    });
  } catch (err) {
    console.error("[goals/status]", err.message || err);
    return res.json({
      daily: {},
      weekly: {},
    });
  }
});

router.post("/update", (req, res) => {
  try {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    updateGoalsTargets(body);
    return res.json({
      success: true,
      targets: getEffectiveTargets(),
    });
  } catch (err) {
    console.error("[goals/update]", err.message || err);
    return res.status(400).json({ success: false, error: "invalid body" });
  }
});

/**
 * @param {(s: unknown) => string} esc
 * @param {object | null | undefined} raw
 */
function goalsTrackerSectionHtml(esc, raw) {
  if (!raw || typeof raw !== "object") {
    return (
      '<section style="margin:0 0 18px 0;padding:16px;border-radius:16px;background:#0f172a;border:1px solid #334155;">' +
      '<h2 style="font-size:1.02rem;margin:0 0 8px;color:#fbbf24;font-weight:800;">🎯 GOALS TRACKER</h2>' +
      '<p style="margin:0;font-size:0.9rem;opacity:0.78;line-height:1.45;">Goals not available yet</p>' +
      "</section>"
    );
  }
  if (raw.kpiAvailable === false) {
    return (
      '<section style="margin:0 0 18px 0;padding:16px;border-radius:16px;background:#0f172a;border:1px solid #334155;">' +
      '<h2 style="font-size:1.02rem;margin:0 0 8px;color:#fbbf24;font-weight:800;">🎯 GOALS TRACKER</h2>' +
      '<p style="margin:0;font-size:0.9rem;opacity:0.78;line-height:1.45;">Goals not available yet</p>' +
      "</section>"
    );
  }

  const daily = raw.daily || {};
  const weekly = raw.weekly || {};

  function statusColor(st) {
    const s = String(st || "").toLowerCase();
    if (s === "ahead") return "#22c55e";
    if (s === "on_track") return "#facc15";
    return "#ef4444";
  }

  function line(label, row) {
    const r = row && typeof row === "object" ? row : { actual: 0, target: 0, status: "behind" };
    const a = Number(r.actual) || 0;
    const t = Number(r.target) || 0;
    const st = String(r.status || "behind");
    const col = statusColor(st);
    return `<div style="margin-bottom:8px;font-size:0.88rem;line-height:1.45;">
      <span style="opacity:0.88;">${esc(label)}:</span>
      <strong style="color:#f8fafc;"> ${esc(String(a))}</strong>
      <span style="opacity:0.75;"> / ${esc(String(t))}</span>
      <span style="font-weight:800;color:${col};"> → ${esc(st.replace(/_/g, " "))}</span>
    </div>`;
  }

  return `<section style="margin:0 0 18px 0;padding:16px;border-radius:16px;background:#1a1508;border:1px solid #b45309;">
    <h2 style="font-size:1.02rem;margin:0 0 10px;color:#fbbf24;font-weight:800;">🎯 GOALS TRACKER</h2>
    <div style="font-size:0.72rem;font-weight:800;letter-spacing:0.05em;opacity:0.78;margin-bottom:6px;">DAILY</div>
    ${line("Follow-ups", daily.followups)}
    ${line("Draft Invoices", daily.invoices)}
    ${line("Production Moves", daily.productionMoves)}
    <div style="font-size:0.72rem;font-weight:800;letter-spacing:0.05em;opacity:0.78;margin:12px 0 6px;">WEEKLY</div>
    ${line("Follow-ups", weekly.followups)}
    ${line("Draft Invoices", weekly.invoices)}
    ${line("Production Moves", weekly.productionMoves)}
  </section>`;
}

module.exports = {
  router,
  goalsTrackerSectionHtml,
};
