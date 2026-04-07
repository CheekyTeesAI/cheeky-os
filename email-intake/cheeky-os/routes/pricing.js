/**
 * Bundle 36 — POST /pricing/check + recent checks store for dashboards.
 */

const express = require("express");
const fs = require("fs");
const path = require("path");
const { evaluatePricingGuard } = require("../services/pricingGuardService");
const { addException } = require("../services/exceptionQueueService");
const {
  evaluateExceptionOverride,
  recordOverrideUse,
} = require("../services/exceptionOverrideService");
const { recordLedgerEventSafe } = require("../services/actionLedgerService");

const router = express.Router();

const RECENT_FILE = path.join(
  __dirname,
  "..",
  "data",
  "pricing-check-recent.json"
);
const MAX_RECENT = 50;

/**
 * @param {object} entry
 */
function appendPricingCheck(entry) {
  let data = { entries: [] };
  try {
    const txt = fs.readFileSync(RECENT_FILE, "utf8");
    const j = JSON.parse(txt);
    if (j && Array.isArray(j.entries)) data = { entries: j.entries };
  } catch (_) {}
  data.entries.unshift(entry);
  if (data.entries.length > MAX_RECENT) {
    data.entries = data.entries.slice(0, MAX_RECENT);
  }
  const dir = path.dirname(RECENT_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(RECENT_FILE, JSON.stringify(data, null, 2), "utf8");
}

/**
 * @returns {{ entries: object[] }}
 */
function readRecentPricingChecks() {
  try {
    const txt = fs.readFileSync(RECENT_FILE, "utf8");
    const j = JSON.parse(txt);
    if (j && Array.isArray(j.entries)) return { entries: j.entries };
  } catch (_) {}
  return { entries: [] };
}

/**
 * @param {(s: unknown) => string} esc
 */
function pricingRiskSectionHtml(esc) {
  const entries = readRecentPricingChecks().entries.slice(0, 5);
  if (!entries.length) {
    return (
      '<section style="margin:0 0 18px 0;padding:16px;border-radius:16px;background:#0f172a;border:1px solid #334155;">' +
      '<h2 style="font-size:1.02rem;margin:0 0 8px;color:#fde047;font-weight:800;">💵 PRICING RISK</h2>' +
      '<p style="margin:0;font-size:0.9rem;opacity:0.8;line-height:1.45;">No pricing checks recorded yet.</p>' +
      '<p style="margin:10px 0 0;font-size:0.78rem;opacity:0.72;">Default margin target: <strong>45%</strong> · <code style="background:#1e293b;padding:2px 6px;border-radius:6px;">POST /pricing/check</code></p>' +
      "</section>"
    );
  }

  const cards = entries
    .map((row) => {
      if (!row || typeof row !== "object") return "";
      const st = String(
        /** @type {{ pricingStatus?: string }} */ (row).pricingStatus || ""
      ).toLowerCase();
      let band =
        "background:#101010;border:1px solid #334155;";
      if (st === "clear") {
        band =
          "background:#052e16;border:1px solid #166534;";
      } else if (st === "review") {
        band =
          "background:#2a1f0a;border:2px solid #f97316;";
      } else if (st === "blocked") {
        band =
          "background:#450a0a;border:2px solid #ef4444;";
      }
      const reason = String(row.reason || "").trim();
      const reasonShow =
        reason.length > 100 ? reason.slice(0, 97) + "…" : reason;
      const flags = Array.isArray(row.flags) ? row.flags : [];
      const flagsShow = esc(flags.slice(0, 4).join(", "));
      return `
  <div style="margin-bottom:10px;padding:12px;border-radius:12px;${band}">
    <div style="font-weight:800;font-size:1rem;">${esc(
      String(row.customerName || "—")
    )}</div>
    <div style="margin-top:6px;font-size:0.78rem;font-weight:900;letter-spacing:0.06em;color:#fde68a;">${esc(
      st.toUpperCase() || "—"
    )}</div>
    <div style="margin-top:8px;font-size:0.88rem;line-height:1.45;">Sell ${esc(
      String(row.sellPrice ?? "—")
    )} · Cost ${esc(String(row.estimatedCost ?? "—"))} · Margin ${esc(
      String(row.marginPercent ?? 0)
    )}%</div>
    ${
      reasonShow
        ? `<div style="margin-top:8px;font-size:0.84rem;opacity:0.92;">${esc(
            reasonShow
          )}</div>`
        : ""
    }
    ${
      flags.length
        ? `<div style="margin-top:6px;font-size:0.72rem;opacity:0.75;">Flags: ${flagsShow}</div>`
        : ""
    }
    ${
      row.overrideApplied
        ? `<div style="margin-top:8px;font-size:0.72rem;font-weight:900;color:#4ade80;letter-spacing:0.04em;">Founder Override Applied</div>`
        : ""
    }
  </div>`;
    })
    .filter(Boolean)
    .join("");

  return (
    '<section style="margin:0 0 18px 0;padding:16px;border-radius:16px;background:#0c0a09;border:1px solid #854d0e;">' +
    '<h2 style="font-size:1.02rem;margin:0 0 10px;color:#fde047;font-weight:800;">💵 PRICING RISK</h2>' +
    '<p style="margin:0 0 12px;font-size:0.78rem;opacity:0.75;">Default margin target: <strong>45%</strong></p>' +
    cards +
    "</section>"
  );
}

router.post("/check", (req, res) => {
  try {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const result = evaluatePricingGuard(body);
    const orderId = String(body.orderId != null ? body.orderId : "").trim();
    const customerName = String(body.customerName != null ? body.customerName : "").trim();

    let overrideApplied = false;
    let overrideReason = "";
    let matchedOverrideId = "";

    if (result.pricingStatus === "review" || result.pricingStatus === "blocked") {
      try {
        const ovr = evaluateExceptionOverride({
          orderId,
          customerName,
          exceptionType: "pricing",
          actionType: "pricing_check",
          reason: result.reason ? String(result.reason) : "",
        });
        if (ovr.overrideAllowed) {
          recordOverrideUse(ovr.matchedExceptionId);
          overrideApplied = true;
          overrideReason = "Founder approved pricing exception";
          matchedOverrideId = ovr.matchedExceptionId;
          recordLedgerEventSafe({
            type: "override",
            action: "pricing_override_applied",
            status: "success",
            customerName,
            orderId,
            reason: overrideReason,
            meta: { matchedOverrideId },
          });
        } else {
          addException({
            type: "pricing",
            customerName,
            orderId,
            severity: result.pricingStatus === "blocked" ? "critical" : "high",
            reason: result.reason
              ? String(result.reason)
              : `Pricing guard: ${result.pricingStatus}`,
          });
        }
      } catch (_) {
        addException({
          type: "pricing",
          customerName,
          orderId,
          severity: result.pricingStatus === "blocked" ? "critical" : "high",
          reason: result.reason
            ? String(result.reason)
            : `Pricing guard: ${result.pricingStatus}`,
        });
      }
    }

    const est = body.estimatedCost;
    const resultOut = {
      ...result,
      ...(overrideApplied
        ? {
            overrideApplied: true,
            overrideReason,
            matchedOverrideId,
            actionableWithOverride: true,
          }
        : {}),
    };

    appendPricingCheck({
      at: new Date().toISOString(),
      customerName,
      orderId,
      quantity: Number(body.quantity) || 0,
      productType: String(body.productType != null ? body.productType : ""),
      printType: String(body.printType != null ? body.printType : ""),
      sellPrice: Number(body.sellPrice),
      estimatedCost: est,
      paymentStatus: String(body.paymentStatus != null ? body.paymentStatus : ""),
      notesPreview:
        String(body.notes != null ? body.notes : "").length > 120
          ? String(body.notes).slice(0, 117) + "…"
          : String(body.notes != null ? body.notes : ""),
      marginPercent: result.marginPercent,
      passesMarginRule: result.passesMarginRule,
      pricingStatus: result.pricingStatus,
      reason: result.reason,
      flags: result.flags,
      overrideApplied,
      overrideReason: overrideApplied ? overrideReason : "",
    });
    return res.json({
      success: true,
      result: resultOut,
    });
  } catch (err) {
    console.error("[pricing/check]", err.message || err);
    const result = evaluatePricingGuard({
      sellPrice: 0,
      estimatedCost: -1,
      customerName: "",
      notes: "",
      paymentStatus: "",
    });
    return res.json({
      success: false,
      error: err instanceof Error ? err.message : String(err),
      result,
    });
  }
});

module.exports = {
  router,
  readRecentPricingChecks,
  pricingRiskSectionHtml,
};
