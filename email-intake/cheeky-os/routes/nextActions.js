/**
 * Bundle 44 — GET /next/actions + NEXT ACTIONS panel HTML.
 */

const { Router } = require("express");
const { getNextActionsPayload } = require("../services/gapDetectorService");

const router = Router();

router.get("/actions", async (_req, res) => {
  try {
    const out = await getNextActionsPayload();
    return res.json({
      gaps: Array.isArray(out.gaps) ? out.gaps : [],
      topActions: Array.isArray(out.topActions) ? out.topActions : [],
    });
  } catch (err) {
    console.error("[next/actions]", err.message || err);
    return res.json({ gaps: [], topActions: [] });
  }
});

/**
 * @param {(s: unknown) => string} esc
 * @param {{ gaps?: object[], topActions?: object[] } | null | undefined} raw
 */
function nextActionsSectionHtml(esc, raw) {
  const top = raw && Array.isArray(raw.topActions) ? raw.topActions : [];
  if (!top.length) {
    return (
      '<section style="margin:0 0 18px 0;padding:16px;border-radius:16px;background:#052e16;border:1px solid #166534;">' +
      '<h2 style="font-size:1.02rem;margin:0 0 8px;color:#86efac;font-weight:800;">🔥 NEXT ACTIONS</h2>' +
      '<p style="margin:0;font-size:0.92rem;opacity:0.88;line-height:1.45;">You\'re on track — keep executing.</p>' +
      "</section>"
    );
  }

  function priColor(p) {
    const u = String(p || "").toLowerCase();
    if (u === "critical") return "#ef4444";
    if (u === "high") return "#f97316";
    if (u === "medium") return "#eab308";
    return "#94a3b8";
  }

  const cards = top
    .map((t) => {
      if (!t || typeof t !== "object") return "";
      const act = String(t.action || "").trim() || "—";
      const reason = String(t.reason || "").trim();
      const pr = String(t.priority || "medium").toLowerCase();
      const prShow = pr.toUpperCase();
      const col = priColor(pr);
      const reasonShow = reason.length > 160 ? reason.slice(0, 157) + "…" : reason;
      return `<div style="margin-bottom:12px;padding:12px;border-radius:12px;background:#101010;border:1px solid #333;">
        <div style="font-size:0.95rem;font-weight:800;line-height:1.35;color:#f8fafc;">${esc(act)}</div>
        ${
          reasonShow
            ? `<div style="margin-top:6px;font-size:0.8rem;line-height:1.45;opacity:0.88;">${esc(
                reasonShow
              )}</div>`
            : ""
        }
        <div style="margin-top:8px;font-size:0.72rem;font-weight:900;letter-spacing:0.04em;color:${col};">${esc(
          prShow
        )}</div>
      </div>`;
    })
    .filter(Boolean)
    .join("");

  return (
    '<section style="margin:0 0 18px 0;padding:16px;border-radius:16px;background:#450a0a;border:1px solid #dc2626;">' +
    '<h2 style="font-size:1.02rem;margin:0 0 10px;color:#fecaca;font-weight:800;">🔥 NEXT ACTIONS</h2>' +
    '<p style="margin:0 0 10px;font-size:0.78rem;opacity:0.8;line-height:1.4;">Top prioritized moves — recommendations only (nothing runs automatically).</p>' +
    cards +
    "</section>"
  );
}

module.exports = {
  router,
  nextActionsSectionHtml,
};
