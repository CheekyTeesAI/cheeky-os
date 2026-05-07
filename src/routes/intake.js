/**
 * Customer intake HTTP API — handlers wrapped; failures return JSON, not throws.
 */
const express = require("express");
const path = require("path");
const router = express.Router();
const crypto = require("crypto");

const { tryHandleUniversalPost } = require(path.join(
  __dirname,
  "..",
  "..",
  "email-intake",
  "cheeky-os",
  "services",
  "universalIntake.service"
));
const {
  tryHandlePhase1DvIntakePost,
} = require(path.join(
  __dirname,
  "..",
  "..",
  "email-intake",
  "cheeky-os",
  "services",
  "phase1DvIntake.service"
));
const {
  runIntakeBrainParse,
} = require(path.join(
  __dirname,
  "..",
  "..",
  "email-intake",
  "cheeky-os",
  "services",
  "cheekyIntakeBrain.service"
));

const intake = require("../services/intakeService");
const { buildMissingInfoResponse } = require("../services/intakeResponseService");
const { generatePortalToken } = require("../services/portalTokenService");
const { logAction } = require("../services/auditService");
const { CHEEKY_createIntakeOrder } = require("../services/orderService");

/** Accept Copilot prefixes on intake GUID (dynamic keys ending _intakequeueid). */
function pickDataverseIntakeGuidFromBody(b) {
  if (!b || typeof b !== "object") return "";
  const direct = [
    b.intake_id,
    b.intakeId,
    b.ct_intake_queueid,
    b.cr2d1_intakequeueid,
    b.cr2d1_IntakeQueueId,
  ];
  for (const v of direct) {
    const s = v != null ? String(v).trim() : "";
    if (/^[0-9a-fA-F]{8}-(?:[0-9a-fA-F]{4}-){3}[0-9a-fA-F]{12}$/.test(s)) return s;
  }
  for (const k of Object.keys(b)) {
    if (!/_intakequeueid$/i.test(k) && !/_IntakeQueueId$/i.test(k)) continue;
    const s = String(b[k] == null ? "" : b[k]).trim();
    if (/^[0-9a-fA-F]{8}-(?:[0-9a-fA-F]{4}-){3}[0-9a-fA-F]{12}$/.test(s)) return s;
  }
  return "";
}

function fallbackEmail(name, phone) {
  const raw = `${String(name || "new")}:${String(phone || "")}:${Date.now()}`;
  const hash = crypto.createHash("sha256").update(raw).digest("hex").slice(0, 24);
  return `intake-${hash}@cheeky-intake.local`;
}

router.get("/needs-info", (req, res) => {
  try {
    const rows = intake.getIntakeRecords({ status: "NEEDS_INFO", limit: Number(req.query.limit) || 50 });
    return res.status(200).json({ success: true, records: rows, mock: false });
  } catch (e) {
    return res.status(200).json({ success: false, records: [], error: e && e.message ? e.message : "error", mock: true });
  }
});

router.get("/ready", (req, res) => {
  try {
    const q = intake.getIntakeRecords({ status: "READY_FOR_QUOTE", limit: 80 });
    const j = intake.getIntakeRecords({ status: "READY_FOR_JOB", limit: 80 });
    return res.status(200).json({
      success: true,
      readyForQuote: q,
      readyForJob: j,
      mock: false,
    });
  } catch (e) {
    return res.status(200).json({ success: false, readyForQuote: [], readyForJob: [], mock: true, error: e && e.message ? e.message : "error" });
  }
});

router.get("/", (req, res) => {
  try {
    const rows = intake.getIntakeRecords({
      status: req.query.status,
      since: req.query.since,
      limit: Number(req.query.limit) || 100,
    });
    const dash = intake.getIntakeDashboardSnapshot();
    return res.status(200).json({ success: true, records: rows, ...dash, mock: false });
  } catch (e) {
    return res.status(200).json({ success: false, records: [], mock: true, error: e && e.message ? e.message : "error" });
  }
});

router.post("/email", async (req, res) => {
  try {
    const b = req.body && typeof req.body === "object" ? req.body : {};
    const from = b.from && typeof b.from === "object" ? b.from : {};
    const out = await intake.ingestPipeline({
      source: "EMAIL",
      subject: b.subject || "",
      body: b.body || "",
      phone: b.phone || "",
      from: { name: from.name || "", email: from.email || "" },
      attachments: b.attachments,
      mock: b.mock === true,
    });
    return res.status(200).json(out);
  } catch (e) {
    return res.status(200).json({ success: false, mock: true, error: e && e.message ? e.message : "error" });
  }
});

router.post("/web", async (req, res) => {
  try {
    const b = req.body && typeof req.body === "object" ? req.body : {};
    const out = await intake.ingestPipeline({
      source: "WEB",
      subject: b.subject || "Web form",
      body: b.body || b.message || "",
      phone: b.phone || "",
      customerName: b.customerName || "",
      from: { name: b.customerName || "", email: b.email || "" },
      attachments: b.attachments,
      mock: b.mock === true,
    });
    return res.status(200).json(out);
  } catch (e) {
    return res.status(200).json({ success: false, mock: true, error: e && e.message ? e.message : "error" });
  }
});

router.post("/manual", async (req, res) => {
  try {
    const b = req.body && typeof req.body === "object" ? req.body : {};
    const out = await intake.ingestPipeline({
      source: "MANUAL",
      subject: b.subject || "Manual entry",
      body: b.notes || b.body || "",
      phone: b.phone || "",
      customerName: b.customerName || "",
      from: { name: b.customerName || "", email: b.email || "" },
      attachments: b.attachments,
      mock: b.mock === true,
    });
    return res.status(200).json(out);
  } catch (e) {
    return res.status(200).json({ success: false, mock: true, error: e && e.message ? e.message : "error" });
  }
});

router.post("/sms", async (req, res) => {
  try {
    const b = req.body && typeof req.body === "object" ? req.body : {};
    const out = await intake.ingestPipeline({
      source: "SMS",
      subject: b.subject || "SMS",
      body: b.body || b.message || b.notes || "",
      phone: b.phone || b.from || "",
      customerName: b.customerName || "",
      from: { name: b.customerName || "", email: b.email || "" },
      attachments: b.attachments,
      mock: b.mock === true,
    });
    return res.status(200).json(out);
  } catch (e) {
    return res.status(200).json({ success: false, mock: true, error: e && e.message ? e.message : "error" });
  }
});

/** Phase 2: manual/backfill AI parse for a Dataverse intake GUID. */
router.post("/ai-parse", async (req, res) => {
  try {
    const b = req.body && typeof req.body === "object" ? req.body : {};
    const intakeId = pickDataverseIntakeGuidFromBody(b);
    if (!intakeId) {
      return res.status(400).json({
        ok: false,
        error: "intake_id required",
        code: "missing_intake_guid",
        hint: '{"intake_id":"<guid>","force":false}',
      });
    }
    const out = await runIntakeBrainParse(intakeId, { force: b.force === true });
    if (out && out.code === "openai_missing") {
      return res.status(503).json(out);
    }
    const code = out.ok ? 200 : 502;
    return res.status(code).json(out);
  } catch (e) {
    return res.status(500).json({
      ok: false,
      error: e && e.message ? e.message : "ai_parse_route_failed",
    });
  }
});

// v6.6 website intake: POST /api/intake
router.post("/", async (req, res) => {
  // Phase 1 Dataverse (+ audit): customer_name + contact_info + request_text + source (+ optional metadata)
  try {
    if (await tryHandlePhase1DvIntakePost(req, res)) return;
  } catch (p1Err) {
    return res.status(500).json({
      ok: false,
      error: p1Err && p1Err.message ? p1Err.message : "phase1_intake_delegate_failed",
      code: "PHASE1_INTAKE_FAILED",
    });
  }

  // v3.5 universal Dataverse intake (customer_name + request_text + source) — additive branch
  try {
    if (await tryHandleUniversalPost(req, res)) return;
  } catch (uniErr) {
    return res.status(500).json({
      success: false,
      error: uniErr && uniErr.message ? uniErr.message : "universal_intake_delegate_failed",
      code: "UNIVERSAL_INTAKE_FAILED",
    });
  }

  // [CHEEKY-GATE] Delegated to orderService.CHEEKY_createIntakeOrder.
  try {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const customerName = String(body.customerName || "").trim() || "New Customer";
    const email = String(body.email || "").trim() || fallbackEmail(customerName, body.phone);
    const phone = String(body.phone || "").trim() || null;
    const product = String(body.product || "").trim() || "Custom Apparel";
    const quantity = Math.max(1, parseInt(String(body.quantity || "1"), 10) || 1);
    const notes = String(body.notes || "").trim();

    const out = await CHEEKY_createIntakeOrder({ customerName, email, phone, notes, product, quantity, generatePortalToken });
    if (!out.success) return res.status(503).json({ success: false, error: out.error, code: out.code });

    await logAction("CREATE_ORDER", "Order", out.data.id, { customer: out.data.customerName });

    return res.json({ success: true, data: out.data });
  } catch (e) {
    return res.json({
      success: false,
      error: e && e.message ? e.message : "intake_failed",
      code: "INTAKE_FAILED",
    });
  }
});

router.get("/:id", (req, res) => {
  try {
    const row = intake.getIntakeById(req.params.id);
    if (!row) {
      return res.status(200).json({ success: false, error: "not_found", mock: true });
    }
    const draftReply = buildMissingInfoResponse(row);
    return res.status(200).json({ success: true, intake: row, draftReply, mock: false });
  } catch (e) {
    return res.status(200).json({ success: false, mock: true, error: e && e.message ? e.message : "error" });
  }
});

router.post("/:id/convert-job", async (req, res) => {
  try {
    const out = await intake.convertIntakeToJob(req.params.id);
    return res.status(200).json({ success: Boolean(out.success), ...out, mock: false });
  } catch (e) {
    return res.status(200).json({ success: false, mock: true, error: e && e.message ? e.message : "error" });
  }
});

router.post("/:id/convert-quote", async (req, res) => {
  try {
    const out = await intake.convertIntakeToQuoteDraft(req.params.id);
    return res.status(200).json(out);
  } catch (e) {
    return res.status(200).json({ success: false, mock: true, error: e && e.message ? e.message : "error" });
  }
});

module.exports = router;
