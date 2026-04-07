/**
 * Bundle 39 — GET /exceptions/pending · POST approve/reject.
 */

const express = require("express");
const {
  getPendingExceptions,
  getApprovedExceptions,
  approveException,
  rejectException,
} = require("../services/exceptionQueueService");
const { recordLedgerEventSafe } = require("../services/actionLedgerService");

const router = express.Router();
router.use(express.json());

router.get("/pending", (_req, res) => {
  try {
    return res.json({ exceptions: getPendingExceptions() });
  } catch (err) {
    console.error("[exceptions/pending]", err.message || err);
    return res.json({ exceptions: [] });
  }
});

router.post("/approve", (req, res) => {
  try {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const id = body.id;
    const resolvedBy = body.resolvedBy;
    const pending = getPendingExceptions();
    const ex =
      Array.isArray(pending) && id
        ? pending.find((e) => e && String(e.id) === String(id))
        : null;
    const out = approveException(id, resolvedBy);
    if (!out.ok) {
      return res.status(400).json({ success: false, error: "not found or not pending" });
    }
    recordLedgerEventSafe({
      type: "exception",
      action: "exception_approved",
      status: "approved",
      customerName: ex && ex.customerName != null ? String(ex.customerName) : "",
      orderId: ex && ex.orderId != null ? String(ex.orderId) : "",
      reason: ex && ex.reason != null ? String(ex.reason) : "",
      meta: {
        exceptionId: String(id || ""),
        resolvedBy: String(resolvedBy != null ? resolvedBy : ""),
      },
    });
    return res.json({ success: true, status: "approved" });
  } catch (err) {
    console.error("[exceptions/approve]", err.message || err);
    return res.status(500).json({ success: false, error: "server error" });
  }
});

router.post("/reject", (req, res) => {
  try {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const id = body.id;
    const resolvedBy = body.resolvedBy;
    const pending = getPendingExceptions();
    const ex =
      Array.isArray(pending) && id
        ? pending.find((e) => e && String(e.id) === String(id))
        : null;
    const out = rejectException(id, resolvedBy);
    if (!out.ok) {
      return res.status(400).json({ success: false, error: "not found or not pending" });
    }
    recordLedgerEventSafe({
      type: "exception",
      action: "exception_rejected",
      status: "rejected",
      customerName: ex && ex.customerName != null ? String(ex.customerName) : "",
      orderId: ex && ex.orderId != null ? String(ex.orderId) : "",
      reason: ex && ex.reason != null ? String(ex.reason) : "",
      meta: {
        exceptionId: String(id || ""),
        resolvedBy: String(resolvedBy != null ? resolvedBy : ""),
      },
    });
    return res.json({ success: true, status: "rejected" });
  } catch (err) {
    console.error("[exceptions/reject]", err.message || err);
    return res.status(500).json({ success: false, error: "server error" });
  }
});

/**
 * @param {(s: unknown) => string} esc
 * @param {object[]} pending
 * @param {{ inputId?: string }} [opts]
 */
function exceptionApprovalsSectionHtml(esc, pending, opts) {
  const inputId = (opts && opts.inputId) || "exc-resolved-by";
  const list = Array.isArray(pending) ? pending.slice(0, 5) : [];
  if (!list.length) {
    return (
      '<section style="margin:0 0 18px 0;padding:16px;border-radius:16px;background:#1c1917;border:1px solid #57534e;">' +
      '<h2 style="font-size:1.02rem;margin:0 0 8px;color:#fcd34d;font-weight:800;">⚠️ EXCEPTION APPROVALS</h2>' +
      '<p style="margin:0;font-size:0.9rem;opacity:0.78;line-height:1.45;">No pending exception approvals</p>' +
      "</section>"
    );
  }

  const byLine =
    '<label style="display:block;font-size:0.78rem;opacity:0.8;margin-bottom:6px;">Resolved by</label>' +
    `<input id="${esc(inputId)}" type="text" value="Patrick" style="width:100%;box-sizing:border-box;padding:10px 12px;border-radius:10px;border:1px solid #444;background:#0c0a09;color:#e7e5e4;font-size:0.95rem;margin-bottom:12px;"/>`;

  const btnBase =
    "flex:1;min-height:44px;padding:10px 12px;border-radius:10px;font-weight:800;font-size:0.82rem;cursor:pointer;border:1px solid #444;";
  const cards = list
    .map((e) => {
      if (!e || typeof e !== "object") return "";
      const idJs = String(/** @type {{ id?: string }} */ (e).id || "").replace(/'/g, "\\'");
      const typ = String(/** @type {{ type?: string }} */ (e).type || "").toUpperCase();
      const sev = String(/** @type {{ severity?: string }} */ (e).severity || "").toUpperCase();
      let band =
        "background:#141414;border:1px solid #333;";
      if (sev === "CRITICAL") {
        band =
          "background:#450a0a;border:2px solid #ef4444;box-shadow:0 0 14px rgba(239,68,68,0.35);";
      } else if (sev === "HIGH") {
        band = "background:#2a1f0a;border:2px solid #f97316;";
      } else if (sev === "LOW") {
        band = "background:#101010;border:1px solid #2a2a2a;opacity:0.72;";
      }
      const reason = String(/** @type {{ reason?: string }} */ (e).reason || "");
      const reasonShow = reason.length > 140 ? reason.slice(0, 137) + "…" : reason;
      const oid = String(/** @type {{ orderId?: string }} */ (e).orderId || "").trim();
      const cn = String(/** @type {{ customerName?: string }} */ (e).customerName || "").trim();
      const ca = String(/** @type {{ createdAt?: string }} */ (e).createdAt || "");
      const when = ca ? esc(new Date(ca).toLocaleString()) : "—";
      return `
  <div style="margin-bottom:12px;padding:12px;border-radius:12px;${band}">
    <div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start;">
      <span style="font-size:0.72rem;font-weight:900;color:#fde68a;letter-spacing:0.04em;">${esc(typ || "—")}</span>
      <span style="font-size:0.65rem;font-weight:900;color:#fca5a5;">${esc(sev || "—")}</span>
    </div>
    <div style="margin-top:8px;font-weight:800;font-size:1rem;line-height:1.3;">${esc(cn || "—")}</div>
    ${
      oid
        ? `<div style="margin-top:4px;font-size:0.72rem;opacity:0.75;word-break:break-all;">Order: ${esc(
            oid
          )}</div>`
        : ""
    }
    <div style="margin-top:8px;font-size:0.84rem;line-height:1.45;opacity:0.92;">${esc(reasonShow)}</div>
    <div style="margin-top:6px;font-size:0.72rem;opacity:0.65;">${when}</div>
    <div style="margin-top:10px;display:flex;gap:8px;">
      <button type="button" style="${btnBase}background:#14532d;color:#bbf7d0;border-color:#166534;" onclick="(function(){var el=document.getElementById('${esc(
        inputId
      )}');var by=el&&el.value?el.value:'Patrick';fetch('/exceptions/approve',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:'${idJs}',resolvedBy:by})}).then(function(r){return r.json();}).then(function(){location.reload();}).catch(function(){});})();">Approve</button>
      <button type="button" style="${btnBase}background:#450a0a;color:#fecaca;border-color:#991b1b;" onclick="(function(){var el=document.getElementById('${esc(
        inputId
      )}');var by=el&&el.value?el.value:'Patrick';fetch('/exceptions/reject',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:'${idJs}',resolvedBy:by})}).then(function(r){return r.json();}).then(function(){location.reload();}).catch(function(){});})();">Reject</button>
    </div>
  </div>`;
    })
    .filter(Boolean)
    .join("");

  return (
    '<section style="margin:0 0 18px 0;padding:16px;border-radius:16px;background:#1c1917;border:1px solid #92400e;">' +
    '<h2 style="font-size:1.02rem;margin:0 0 10px;color:#fcd34d;font-weight:800;">⚠️ EXCEPTION APPROVALS</h2>' +
    byLine +
    cards +
    "</section>"
  );
}

/**
 * @param {(s: unknown) => string} esc
 * @param {object[]} approved
 */
function approvedOverridesSectionHtml(esc, approved) {
  const list = Array.isArray(approved) ? approved.slice(0, 5) : [];
  if (!list.length) {
    return (
      '<section style="margin:0 0 18px 0;padding:16px;border-radius:16px;background:#0f172a;border:1px solid #166534;">' +
      '<h2 style="font-size:1.02rem;margin:0 0 8px;color:#86efac;font-weight:800;">✅ APPROVED OVERRIDES</h2>' +
      '<p style="margin:0;font-size:0.9rem;opacity:0.78;line-height:1.45;">No approved overrides applied</p>' +
      "</section>"
    );
  }

  const cards = list
    .map((e) => {
      if (!e || typeof e !== "object") return "";
      const typ = String(/** @type {{ type?: string }} */ (e).type || "").toUpperCase();
      const cn = String(/** @type {{ customerName?: string }} */ (e).customerName || "").trim();
      const oid = String(/** @type {{ orderId?: string }} */ (e).orderId || "").trim();
      const reason = String(/** @type {{ reason?: string }} */ (e).reason || "");
      const rs = reason.length > 100 ? reason.slice(0, 97) + "…" : reason;
      const by = String(/** @type {{ resolvedBy?: string }} */ (e).resolvedBy || "").trim();
      const ra = String(/** @type {{ resolvedAt?: string }} */ (e).resolvedAt || "");
      const when = ra ? esc(new Date(ra).toLocaleString()) : "—";
      return `
  <div style="margin-bottom:10px;padding:12px;border-radius:12px;background:#052e16;border:1px solid #22c55e;">
    <div style="font-size:0.72rem;font-weight:900;color:#bbf7d0;letter-spacing:0.04em;">${esc(typ || "—")}</div>
    <div style="margin-top:8px;font-weight:800;font-size:0.95rem;">${esc(cn || "—")}</div>
    ${
      oid
        ? `<div style="margin-top:4px;font-size:0.72rem;opacity:0.85;word-break:break-all;">${esc(oid)}</div>`
        : ""
    }
    <div style="margin-top:8px;font-size:0.82rem;line-height:1.4;opacity:0.92;">${esc(rs)}</div>
    <div style="margin-top:8px;font-size:0.72rem;opacity:0.75;">By ${esc(by || "—")} · ${when}</div>
  </div>`;
    })
    .filter(Boolean)
    .join("");

  return (
    '<section style="margin:0 0 18px 0;padding:16px;border-radius:16px;background:#052e16;border:1px solid #15803d;">' +
    '<h2 style="font-size:1.02rem;margin:0 0 10px;color:#86efac;font-weight:800;">✅ APPROVED OVERRIDES</h2>' +
    cards +
    "</section>"
  );
}

module.exports = {
  router,
  exceptionApprovalsSectionHtml,
  approvedOverridesSectionHtml,
};
