/**
 * Bundle 41 — ledger endpoints + dashboard HTML section helper.
 */

const { Router } = require("express");
const {
  getRecentEvents,
  getEventsByType,
} = require("../services/actionLedgerService");

const router = Router();

function parseLimit(q) {
  const n = Math.floor(Number(q));
  if (!Number.isFinite(n) || n <= 0) return 20;
  return Math.min(100, n);
}

router.get("/recent", (req, res) => {
  try {
    const limit = parseLimit(req.query && req.query.limit);
    return res.json({ events: getRecentEvents(limit) });
  } catch (err) {
    console.error("[ledger/recent]", err.message || err);
    return res.json({ events: [] });
  }
});

router.get("/type/:type", (req, res) => {
  try {
    const limit = parseLimit(req.query && req.query.limit);
    const type = req.params && req.params.type ? req.params.type : "";
    return res.json({ events: getEventsByType(type, limit) });
  } catch (err) {
    console.error("[ledger/type]", err.message || err);
    return res.json({ events: [] });
  }
});

/**
 * @param {(s: unknown) => string} esc
 * @param {object[]} events
 */
function actionLedgerSectionHtml(esc, events) {
  const list = Array.isArray(events) ? events.slice(0, 10) : [];
  if (!list.length) {
    return (
      '<section style="margin:0 0 18px 0;padding:16px;border-radius:16px;background:#0f172a;border:1px solid #334155;">' +
      '<h2 style="font-size:1.02rem;margin:0 0 8px;color:#c4b5fd;font-weight:800;">📜 ACTION LEDGER</h2>' +
      '<p style="margin:0;font-size:0.9rem;opacity:0.78;line-height:1.45;">No recent system events</p>' +
      "</section>"
    );
  }

  const cards = list
    .map((e) => {
      if (!e || typeof e !== "object") return "";
      const type = String(e.type || "").toUpperCase();
      const action = String(e.action || "");
      const status = String(e.status || "").toLowerCase();
      const customerName = String(e.customerName || "").trim();
      const reason = String(e.reason || "");
      const reasonShow = reason.length > 120 ? reason.slice(0, 117) + "..." : reason;
      const ca = String(e.createdAt || "");
      const when = ca ? esc(new Date(ca).toLocaleString()) : "-";

      let band = "background:#141414;border:1px solid #333;opacity:0.88;";
      if (status === "blocked" || status === "rejected") {
        band = "background:#450a0a;border:2px solid #ef4444;";
      } else if (status === "approved" || status === "success") {
        band = "background:#052e16;border:1px solid #16a34a;";
      } else if (status === "skipped") {
        band = "background:#422006;border:1px solid #d97706;";
      } else if (status === "info") {
        band = "background:#0b1220;border:1px solid #334155;opacity:0.8;";
      }

      return `
  <div style="margin-bottom:10px;padding:12px;border-radius:12px;${band}">
    <div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start;">
      <span style="font-size:0.7rem;font-weight:900;color:#cbd5e1;letter-spacing:0.04em;">${esc(type || "-")}</span>
      <span style="font-size:0.66rem;font-weight:900;color:#fde68a;">${esc(String(status || "info").toUpperCase())}</span>
    </div>
    <div style="margin-top:6px;font-size:0.88rem;font-weight:700;line-height:1.35;">${esc(action || "-")}</div>
    ${customerName ? `<div style="margin-top:4px;font-size:0.8rem;opacity:0.88;">${esc(customerName)}</div>` : ""}
    ${reasonShow ? `<div style="margin-top:6px;font-size:0.8rem;line-height:1.4;opacity:0.9;">${esc(reasonShow)}</div>` : ""}
    <div style="margin-top:6px;font-size:0.72rem;opacity:0.68;">${when}</div>
  </div>`;
    })
    .filter(Boolean)
    .join("");

  return (
    '<section style="margin:0 0 18px 0;padding:16px;border-radius:16px;background:#120b26;border:1px solid #5b21b6;">' +
    '<h2 style="font-size:1.02rem;margin:0 0 10px;color:#c4b5fd;font-weight:800;">📜 ACTION LEDGER</h2>' +
    cards +
    "</section>"
  );
}

module.exports = {
  router,
  actionLedgerSectionHtml,
};
