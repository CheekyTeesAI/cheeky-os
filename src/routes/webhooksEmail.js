const express = require("express");
const router = express.Router();

const { parseEmail } = require("../services/emailParser");
const { saveJob } = require("../data/store");

router.post("/email", async (req, res) => {
  try {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const rawText = String(body.rawText || body.raw || body.body || "");
    const from = body.from ? String(body.from) : null;
    const subject = body.subject ? String(body.subject) : null;
    console.log("[webhooks/email] EMAIL RECEIVED length:", rawText.length, "from:", from || "unknown");

    let intakeHook = null;
    try {
      const { ingestPipeline } = require("../services/intakeService");
      intakeHook = await ingestPipeline({
        source: "EMAIL",
        subject: subject || "",
        body: rawText,
        phone: body.phone ? String(body.phone) : "",
        from: { name: "", email: from || "" },
        attachments: Array.isArray(body.attachments) ? body.attachments : [],
      });
    } catch (_e) {
      intakeHook = null;
    }

    const parsed = parseEmail(rawText);
    const parsedJob = parsed && parsed.job ? parsed.job : {};

    const job = saveJob({
      customer: parsedJob.customer || (from ? String(from).split("@")[0] : undefined),
      dueDate: parsedJob.dueDate,
      status: parsedJob.status || "UNPAID",
      productionType: parsedJob.productionType || "UNKNOWN",
      printMethod: parsedJob.productionType || null,
      lineItems: Array.isArray(parsedJob.lineItems) ? parsedJob.lineItems : [],
      notes: parsedJob.notes || subject || "",
      source: "email",
      fromEmail: from,
      subject,
      raw: rawText.length > 2000 ? `${rawText.slice(0, 2000)}...` : rawText,
    });
    console.log("[webhooks/email] JOB STORED:", job && job.jobId);

    return res.status(200).json({
      success: true,
      jobId: job && job.jobId ? job.jobId : null,
      parsed: parsedJob,
      job,
      intake: intakeHook && intakeHook.intake ? { id: intakeHook.intake.id, status: intakeHook.intake.status } : null,
      mock: false,
    });
  } catch (error) {
    console.error("[webhooks/email] failed:", error && error.message ? error.message : error);
    return res.status(200).json({
      success: false,
      mock: true,
      error: error && error.message ? error.message : "unknown_error",
    });
  }
});

module.exports = router;
