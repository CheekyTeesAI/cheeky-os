/**
 * Service desk HTTP — structured JSON; preview-first outbound.
 */
const express = require("express");
const router = express.Router();

const { getJobById } = require("../data/store");
const { getIntakeById } = require("../services/intakeService");
const { getOperatingSystemJobs } = require("../services/foundationJobMerge");
const { resolveJobContact, resolveIntakeContact, emailOk } = require("../services/communicationContactService");
const { createCommunicationRecord, updateCommunicationRecord } = require("../services/communicationService");
const { buildDedupeKey, canSendCommunication } = require("../services/communicationGuardService");
const { sendEmailCommunication } = require("../services/emailExecutionService");
const { sendSMSCommunication } = require("../services/smsExecutionService");
const { buildAutoSafeResponse } = require("../services/autoSafeResponseEngine");
const { getCommunicationPolicy } = require("../services/communicationPolicyService");
const { runCustomerServiceAutomation } = require("../services/customerServiceAutomationEngine");
const {
  listServiceDeskItems,
  getServiceDeskItem,
  updateServiceDeskItem,
  assignServiceDeskItem,
  closeServiceDeskItem,
  getServiceDeskFlags,
  setServiceDeskFlags,
} = require("../services/serviceDeskService");
const { getRoleQueue } = require("../services/teamHandoffEngine");
const { buildServiceDeskDashboardBundle } = require("../services/serviceDeskBundle");

async function sdLog(message) {
  try {
    const { logEvent } = require("../services/foundationEventLog");
    await logEvent(null, "SERVICE_DESK", String(message || ""));
  } catch (_e) {
    console.log("[SERVICE_DESK]", message);
  }
}

async function resolveJobForContact(jobId) {
  let job = getJobById(jobId);
  if (!job) {
    try {
      const jobs = await getOperatingSystemJobs();
      job = (jobs || []).find((j) => j && j.jobId === jobId) || null;
    } catch (_e) {
      job = null;
    }
  }
  return job;
}

async function contactForItem(item) {
  const rt = String(item.relatedType || "").toUpperCase();
  const rid = String(item.relatedId || "").trim();
  if (!rid) return null;
  if (rt === "INTAKE") {
    const rec = getIntakeById(rid);
    return rec ? resolveIntakeContact(rec) : null;
  }
  if (rt === "JOB") {
    const job = await resolveJobForContact(rid);
    return job ? resolveJobContact(job) : null;
  }
  return null;
}

function commRecommendationFrom(item, built) {
  const ch = String(built.channel || "EMAIL").toUpperCase();
  const c = { channel: ch, templateKey: built.templateKey, relatedType: item.relatedType, relatedId: item.relatedId };
  return {
    ...c,
    type: "DIRECT",
    customerEmail: null,
    customerPhone: null,
  };
}

router.get("/", async (_req, res) => {
  try {
    const bundle = buildServiceDeskDashboardBundle();
    const items = listServiceDeskItems({ limit: 200 });
    return res.status(200).json({ success: true, ...bundle, items });
  } catch (e) {
    return res.status(200).json({
      success: false,
      error: e && e.message ? e.message : "service_desk_error",
      items: [],
      serviceDeskSummary: null,
    });
  }
});

router.get("/owner", (_req, res) => {
  try {
    const escalated = listServiceDeskItems({ state: "ESCALATED", limit: 200 });
    const approvals = listServiceDeskItems({ requiresApproval: true, limit: 200 });
    const ownerQ = getRoleQueue("OWNER");
    const seen = new Set();
    const items = [];
    for (const row of [...escalated, ...approvals, ...ownerQ]) {
      if (!row || !row.id || seen.has(row.id)) continue;
      seen.add(row.id);
      items.push(row);
    }
    items.sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));
    return res.status(200).json({
      success: true,
      role: "OWNER",
      escalated,
      needsApproval: approvals,
      items,
    });
  } catch (e) {
    return res.status(200).json({ success: false, error: e && e.message ? e.message : "error", items: [] });
  }
});

function roleView(role) {
  return (_req, res) => {
    try {
      const items = getRoleQueue(role);
      return res.status(200).json({ success: true, role, items });
    } catch (e) {
      return res.status(200).json({ success: false, error: e && e.message ? e.message : "error", role, items: [] });
    }
  };
}

router.get("/printer", roleView("PRINTER"));
router.get("/admin", roleView("ADMIN"));
router.get("/design", roleView("DESIGN"));

router.get("/escalated", (_req, res) => {
  try {
    const items = listServiceDeskItems({ state: "ESCALATED", limit: 200 });
    return res.status(200).json({ success: true, items });
  } catch (e) {
    return res.status(200).json({ success: false, items: [], error: e && e.message ? e.message : "error" });
  }
});

router.get("/auto-handled", (_req, res) => {
  try {
    const items = listServiceDeskItems({ state: "AUTO_HANDLED", limit: 200 });
    return res.status(200).json({ success: true, items });
  } catch (e) {
    return res.status(200).json({ success: false, items: [], error: e && e.message ? e.message : "error" });
  }
});

router.post("/run", async (_req, res) => {
  try {
    const out = await runCustomerServiceAutomation();
    await sdLog("POST /service-desk/run");
    return res.status(200).json({ success: true, ...out });
  } catch (e) {
    return res.status(200).json({
      success: false,
      error: e && e.message ? e.message : "run_failed",
      autoHandled: [],
      assigned: [],
      escalated: [],
      blocked: [],
    });
  }
});

router.post("/:id/assign", async (req, res) => {
  try {
    const id = String(req.params.id || "").trim();
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const assignedToRole = body.assignedToRole != null ? String(body.assignedToRole) : null;
    const assignedToUserId = body.assignedToUserId != null ? String(body.assignedToUserId) : null;
    if (!assignedToRole) {
      return res.status(200).json({ success: false, error: "assignedToRole required" });
    }
    const row = assignServiceDeskItem(id, { assignedToRole, assignedToUserId, state: "WAITING_TEAM" });
    if (!row) return res.status(200).json({ success: false, error: "not_found" });
    await sdLog(`assign ${id} -> ${assignedToRole}`);
    return res.status(200).json({ success: true, item: row });
  } catch (e) {
    return res.status(200).json({ success: false, error: e && e.message ? e.message : "error" });
  }
});

router.post("/:id/close", async (req, res) => {
  try {
    const id = String(req.params.id || "").trim();
    const row = closeServiceDeskItem(id);
    if (!row) return res.status(200).json({ success: false, error: "not_found" });
    await sdLog(`close ${id}`);
    return res.status(200).json({ success: true, item: row });
  } catch (e) {
    return res.status(200).json({ success: false, error: e && e.message ? e.message : "error" });
  }
});

router.post("/:id/preview-response", async (req, res) => {
  try {
    const id = String(req.params.id || "").trim();
    const item = getServiceDeskItem(id);
    if (!item) return res.status(200).json({ success: false, error: "not_found" });
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const mode = String(body.mode || "PREVIEW").toUpperCase();
    const built = await buildAutoSafeResponse(item);
    const pol = getCommunicationPolicy(built.templateKey);
    const previewText = [built.subject, built.body].filter(Boolean).join("\n\n");
    updateServiceDeskItem(id, {
      latestResponsePreview: previewText.slice(0, 8000),
      state: "READY_TO_SEND",
      waitSubState: built.autoSafe ? item.waitSubState : "WAITING_APPROVAL",
    });
    const contact = await contactForItem(item);
    const ch = String(built.channel || pol.channelPreference || "EMAIL").toUpperCase();
    const recBase = commRecommendationFrom({ ...item, relatedType: item.relatedType, relatedId: item.relatedId }, {
      ...built,
      channel: ch,
    });
    const toEmail = contact && contact.customerEmail;
    const toPhone = contact && contact.customerPhone;
    const dedupeKey = buildDedupeKey({
      ...recBase,
      toEmail,
      toPhone,
      customerEmail: toEmail,
      customerPhone: toPhone,
    });
    const guard = canSendCommunication(
      { ...recBase, toEmail, toPhone, customerEmail: toEmail, customerPhone: toPhone },
      { mode: "PREVIEW" }
    );
    const com = createCommunicationRecord({
      channel: ch,
      relatedType: item.relatedType,
      relatedId: item.relatedId,
      customerId: item.customerId,
      templateKey: built.templateKey,
      subject: built.subject,
      body: built.body || "",
      toAddress: ch === "EMAIL" ? toEmail : null,
      toPhone: ch === "SMS" ? toPhone : null,
      status: "PREVIEW",
      dedupeKey,
      metadata: {
        serviceDeskItemId: id,
        assumptions: built.assumptions || [],
        guard,
        policy: pol,
        mode,
      },
    });
    await sdLog(`preview-response ${id} comm=${com.id}`);
    return res.status(200).json({
      success: true,
      mode: "PREVIEW",
      templateKey: built.templateKey,
      channel: ch,
      policy: pol,
      autoSafe: built.autoSafe,
      assumptions: built.assumptions || [],
      body: built.body,
      subject: built.subject,
      communication: com,
      guard,
    });
  } catch (e) {
    return res.status(200).json({ success: false, error: e && e.message ? e.message : "preview_error" });
  }
});

router.post("/:id/send-response", async (req, res) => {
  try {
    const id = String(req.params.id || "").trim();
    const item = getServiceDeskItem(id);
    if (!item) return res.status(200).json({ success: false, error: "not_found" });
    const body = req.body && typeof req.body === "object" ? req.body : {};
    let mode = String(body.mode || "PREVIEW").toUpperCase();
    const flags = getServiceDeskFlags();
    if (flags.forcePreviewOnly) mode = "PREVIEW";

    const built = await buildAutoSafeResponse(item);
    if (!built.autoSafe || !built.body) {
      return res.status(200).json({
        success: false,
        error: "cannot_send_without_safe_body",
        assumptions: built.assumptions || [],
      });
    }
    const pol = getCommunicationPolicy(built.templateKey);
    if (pol.defaultMode === "APPROVAL_REQUIRED" && mode === "SEND") {
      updateServiceDeskItem(id, { waitSubState: "WAITING_APPROVAL", requiresApproval: true });
      await sdLog(`send blocked approval policy ${id}`);
      return res.status(200).json({
        success: false,
        sent: false,
        reason: "APPROVAL_REQUIRED_BY_POLICY",
        policy: pol,
      });
    }
    if (mode === "PREVIEW") {
      const previewText = [built.subject, built.body].filter(Boolean).join("\n\n");
      updateServiceDeskItem(id, {
        latestResponsePreview: previewText.slice(0, 8000),
        waitSubState: "WAITING_APPROVAL",
      });
      await sdLog(`send-response preview-only ${id}`);
      return res.status(200).json({
        success: true,
        sent: false,
        mode: "PREVIEW",
        policy: pol,
        templateKey: built.templateKey,
        subject: built.subject,
        body: built.body,
      });
    }

    const contact = await contactForItem(item);
    const ch = String(built.channel || pol.channelPreference || "EMAIL").toUpperCase();
    const toEmail = contact && contact.customerEmail;
    const toPhone = contact && contact.customerPhone;
    const rec = {
      channel: ch,
      templateKey: built.templateKey,
      relatedType: item.relatedType,
      relatedId: item.relatedId,
      type: "DIRECT",
      toEmail,
      toPhone,
      customerEmail: toEmail,
      customerPhone: toPhone,
    };
    const guard = canSendCommunication(rec, { mode: "SEND" });
    if (!guard.allowed) {
      const com = createCommunicationRecord({
        channel: ch,
        relatedType: item.relatedType,
        relatedId: item.relatedId,
        templateKey: built.templateKey,
        subject: built.subject,
        body: built.body,
        toAddress: ch === "EMAIL" ? toEmail : null,
        toPhone: ch === "SMS" ? toPhone : null,
        status: guard.reason === "DUPLICATE_RECENT" ? "SKIPPED" : "FAILED",
        error: guard.reason,
        metadata: { serviceDeskItemId: id, guard },
      });
      await sdLog(`send guard block ${id} ${guard.reason}`);
      return res.status(200).json({ success: false, sent: false, error: guard.reason, communication: com, guard });
    }

    if (ch === "EMAIL" && !emailOk(toEmail)) {
      return res.status(200).json({ success: false, sent: false, error: "NO_CONTACT" });
    }

    const dedupeKey = buildDedupeKey(rec);
    const row = createCommunicationRecord({
      channel: ch,
      relatedType: item.relatedType,
      relatedId: item.relatedId,
      customerId: item.customerId,
      templateKey: built.templateKey,
      subject: built.subject,
      body: built.body,
      toAddress: ch === "EMAIL" ? toEmail : null,
      toPhone: ch === "SMS" ? toPhone : null,
      status: "DRAFT",
      dedupeKey,
      metadata: { serviceDeskItemId: id, guard },
    });

    let exec = null;
    if (ch === "EMAIL") {
      exec = await sendEmailCommunication({
        to: toEmail,
        subject: built.subject || "",
        body: built.body,
        mode: "SEND",
      });
    } else {
      exec = await sendSMSCommunication({ to: toPhone, body: built.body, mode: "SEND" });
    }

    if (!exec || !exec.sent) {
      updateCommunicationRecord(row.id, {
        status: "FAILED",
        error: (exec && exec.error) || "send_failed",
        metadata: { ...row.metadata, exec },
      });
      return res.status(200).json({
        success: false,
        sent: false,
        error: (exec && exec.error) || "send_failed",
        communication: row,
      });
    }

    const sentRow = updateCommunicationRecord(row.id, {
      status: "SENT",
      sentAt: new Date().toISOString(),
      provider: exec.provider,
      providerMessageId: exec.providerMessageId || null,
      metadata: { ...row.metadata, exec },
    });

    updateServiceDeskItem(id, {
      state: "WAITING_CUSTOMER",
      waitSubState: null,
      latestResponsePreview: [built.subject, built.body].join("\n\n").slice(0, 8000),
    });
    await sdLog(`response sent ${id} comm=${sentRow.id}`);
    return res.status(200).json({
      success: true,
      sent: true,
      mode: "SEND",
      communication: sentRow,
      providerResult: exec,
    });
  } catch (e) {
    return res.status(200).json({ success: false, sent: false, error: e && e.message ? e.message : "send_error" });
  }
});

module.exports = router;
