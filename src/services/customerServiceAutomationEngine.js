/**
 * Batch automation — creates/updates desk items from intake/jobs; auto-handles when policy allows.
 */
const { getIntakeRecords } = require("./intakeService");
const {
  createServiceDeskItem,
  listServiceDeskItems,
  updateServiceDeskItem,
  getServiceDeskItem,
} = require("./serviceDeskService");
const { classifyServiceNeed } = require("./customerServiceDecisionEngine");
const { evaluateEscalation } = require("./escalationEngine");
const { buildAutoSafeResponse } = require("./autoSafeResponseEngine");
const { getCommunicationPolicy } = require("./communicationPolicyService");
const { createCommunicationRecord } = require("./communicationService");
const { previewCommunication } = require("./communicationOrchestrator");

async function deskLog(msg) {
  try {
    const { logEvent } = require("./foundationEventLog");
    await logEvent(null, "SERVICE_DESK", String(msg || ""));
  } catch (_e) {
    console.log("[SERVICE_DESK]", msg);
  }
}

function existingKey(relatedType, relatedId, category) {
  const rows = listServiceDeskItems({ relatedType, relatedId, limit: 50 });
  return rows.find((r) => String(r.category).toUpperCase() === String(category).toUpperCase()) || null;
}

async function runCustomerServiceAutomation() {
  const autoHandled = [];
  const assigned = [];
  const escalated = [];
  const blocked = [];

  let intakes = [];
  try {
    const all = getIntakeRecords({ limit: 120 });
    intakes = (all || []).filter((r) =>
      /NEEDS_INFO|REVIEW_REQUIRED|READY_FOR_QUOTE/i.test(String(r && r.status))
    );
  } catch (e) {
    blocked.push({ type: "intake_load", error: e && e.message ? e.message : "error" });
  }

  for (const rec of intakes) {
    if (!rec || !rec.id) continue;
    const st = String(rec.status || "").toUpperCase();
    if (!/NEEDS_INFO|REVIEW_REQUIRED|READY_FOR_QUOTE/.test(st)) continue;
    if (existingKey("INTAKE", rec.id, "MISSING_INFO")) continue;

    const cls = classifyServiceNeed({ intake: rec, textSnippet: rec.rawBody || "", relatedId: rec.id });
    const item = createServiceDeskItem({
      source: "EMAIL",
      relatedType: "INTAKE",
      relatedId: rec.id,
      customerId: rec.customerId || null,
      category: cls.category || "MISSING_INFO",
      priority: st === "REVIEW_REQUIRED" ? "HIGH" : "MEDIUM",
      assignedToRole: cls.assignedToRole || "ADMIN",
      state: "NEW",
      summary: `Intake ${rec.id} — ${st}`,
      classification: cls.classification,
      requiresApproval: cls.requiresApproval,
      textSnippet: (rec.rawBody || "").slice(0, 500),
    });

    const esc = evaluateEscalation(item);
    if (esc.escalate) {
      updateServiceDeskItem(item.id, {
        state: "ESCALATED",
        assignedToRole: esc.targetRole || "OWNER",
        escalationReason: esc.reason,
      });
      escalated.push({ id: item.id, reason: esc.reason });
      await deskLog(`escalated ${item.id}`);
      continue;
    }

    if (cls.autoSafe && cls.classification === "AUTO_MISSING_INFO_REQUEST") {
      const resp = await buildAutoSafeResponse(getServiceDeskItem(item.id));
      const pol = getCommunicationPolicy(resp.templateKey);
      updateServiceDeskItem(item.id, {
        state: pol.defaultMode === "AUTO_SAFE" ? "AUTO_HANDLED" : "READY_TO_SEND",
        latestResponsePreview: `${resp.subject || ""}\n\n${resp.body || ""}`,
        requiresApproval: pol.defaultMode === "APPROVAL_REQUIRED",
        waitSubState: pol.defaultMode === "AUTO_SAFE" ? "AUTO_HANDLED" : "WAITING_APPROVAL",
      });
      if (resp.autoSafe && resp.body) {
        try {
          await previewCommunication({
            templateKey: resp.templateKey,
            relatedType: "INTAKE",
            relatedId: rec.id,
            channel: pol.channelPreference || "EMAIL",
          });
        } catch (_e) {
          /* preview optional */
        }
      }
      autoHandled.push({ id: item.id, mode: pol.defaultMode });
      await deskLog(`auto_handled_missing_info ${item.id}`);
    } else {
      updateServiceDeskItem(item.id, { state: "WAITING_TEAM" });
      assigned.push({ id: item.id, role: item.assignedToRole });
    }
  }

  await deskLog(`automation run auto=${autoHandled.length} assigned=${assigned.length} esc=${escalated.length}`);
  return { autoHandled, assigned, escalated, blocked };
}

module.exports = {
  runCustomerServiceAutomation,
};
