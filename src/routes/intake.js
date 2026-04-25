/**
 * Customer intake HTTP API — handlers wrapped; failures return JSON, not throws.
 */
const express = require("express");
const router = express.Router();
const crypto = require("crypto");

const intake = require("../services/intakeService");
const { buildMissingInfoResponse } = require("../services/intakeResponseService");
const { getPrisma } = require("../services/decisionEngine");
const { generatePortalToken } = require("../services/portalTokenService");
const { logAction } = require("../services/auditService");

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

// v6.6 website intake: POST /api/intake
router.post("/", async (req, res) => {
  try {
    const prisma = getPrisma();
    if (!prisma) {
      return res.status(503).json({
        success: false,
        error: "Database unavailable",
        code: "DB_UNAVAILABLE",
      });
    }

    const body = req.body && typeof req.body === "object" ? req.body : {};
    const customerName = String(body.customerName || "").trim() || "New Customer";
    const email = String(body.email || "").trim() || fallbackEmail(customerName, body.phone);
    const phone = String(body.phone || "").trim() || null;
    const product = String(body.product || "").trim() || "Custom Apparel";
    const quantity = Math.max(1, parseInt(String(body.quantity || "1"), 10) || 1);
    const notes = String(body.notes || "").trim();

    const order = await prisma.order.create({
      data: {
        customerName,
        email,
        phone,
        notes,
        status: "INTAKE",
        portalToken: generatePortalToken(),
        portalEnabled: true,
        depositPaid: false,
        garmentsOrdered: false,
        garmentsReceived: false,
        productionComplete: false,
        qcComplete: false,
        nextAction: "Collect deposit",
        nextOwner: "Cheeky",
        blockedReason: "WAITING_ON_DEPOSIT",
      },
    });

    await prisma.lineItem.create({
      data: {
        orderId: order.id,
        description: product,
        quantity,
      },
    });

    await logAction("CREATE_ORDER", "Order", order.id, {
      customer: order.customerName,
    });

    return res.json({
      success: true,
      data: order,
    });
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
