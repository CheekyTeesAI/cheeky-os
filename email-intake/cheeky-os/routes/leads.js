/**
 * Bundle 48 — POST /leads/capture, GET /leads/recent
 */

const { Router } = require("express");
const { normalizeInboundLead } = require("../services/leadIntakeService");
const { pushLead, getRecentLeads } = require("../services/leadRecentQueue");
const { recordLedgerEventSafe } = require("../services/actionLedgerService");

const router = Router();

/**
 * @param {unknown} raw
 * @returns {boolean}
 */
function hasMinimalSignal(raw) {
  const r = raw && typeof raw === "object" ? raw : {};
  const f = (k) => trim(k).length > 0;
  return (
    f(r.name) ||
    f(r.email) ||
    f(r.phone) ||
    f(r.message) ||
    f(r.company)
  );
}

/**
 * @param {unknown} v
 * @returns {string}
 */
function trim(v) {
  return String(v == null ? "" : v).trim();
}

router.post("/capture", (req, res) => {
  try {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    if (!hasMinimalSignal(body)) {
      return res.status(400).json({
        success: false,
        error: "At least one of name, email, phone, message, or company is required",
      });
    }

    const lead = normalizeInboundLead(body);
    pushLead(lead);

    try {
      recordLedgerEventSafe({
        type: "response",
        action: "lead_captured",
        status: "success",
        customerName: lead.leadName || "",
        reason: `${lead.source} · ${lead.quality}`,
        meta: {
          source: lead.source,
          quality: lead.quality,
          email: lead.email,
          phone: lead.phone,
          company: lead.company,
          flags: lead.flags,
        },
      });
    } catch (_) {}

    return res.json({
      success: true,
      lead: {
        leadName: lead.leadName,
        email: lead.email,
        phone: lead.phone,
        company: lead.company,
        message: lead.message,
        source: lead.source,
        quality: lead.quality,
        flags: lead.flags,
      },
    });
  } catch (err) {
    console.error("[leads/capture]", err.message || err);
    return res.status(500).json({
      success: false,
      error: "lead_capture_failed",
    });
  }
});

router.get("/recent", (_req, res) => {
  try {
    const leads = getRecentLeads(50);
    return res.json({ leads });
  } catch (err) {
    console.error("[leads/recent]", err.message || err);
    return res.json({ leads: [] });
  }
});

module.exports = router;
