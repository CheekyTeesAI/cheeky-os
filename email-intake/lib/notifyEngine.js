"use strict";

const recipients = require("./notifyConfig");
const { sendEmail } = require("./integrations/outlook");
const { logEvent } = require("./eventStore");

/**
 * Alert rules (v1):
 * - New INTAKE / PRINT / QC → notify per stage
 * - Moved to COMPLETE → always Patrick (not System inbox)
 *
 * @param {Record<string, unknown>} task
 * @param {"created"|"moved"} eventType
 * @returns {Promise<Record<string, unknown>>}
 */
async function sendTaskNotification(task, eventType = "created") {
  try {
    const to = pickRecipient(task, eventType);
    if (!to) {
      return {
        success: true,
        skipped: true,
        message: "no notification rule for this event",
      };
    }

    const subject = `[Cheeky OS] Task ${String(eventType).toUpperCase()} — ${task.stage}`;
    const body = [
      "Cheeky OS Task Notification",
      "",
      `Event: ${eventType}`,
      `Title: ${task.title}`,
      `Stage: ${task.stage}`,
      `Owner: ${task.owner}`,
      `Role: ${task.role}`,
      `Status: ${task.status}`,
    ].join("\n");

    const out = await sendEmail({ to, subject, body });
    const ok = out && out.success === true;
    try {
      logEvent(ok ? "notification_sent" : "notification_failed", {
        taskId: task.id,
        stage: task.stage,
        eventType,
        mode: out && out.mode,
        message: out && out.message,
      });
    } catch (_) {}
    return out;
  } catch (err) {
    const e = err instanceof Error ? err : new Error(String(err));
    try {
      logEvent("notification_failed", {
        taskId: task.id,
        error: e.message,
      });
    } catch (_) {}
    return {
      success: false,
      error: "NOTIFY_FAILED",
      message: e.message,
    };
  }
}

/**
 * @param {Record<string, unknown>} task
 * @param {"created"|"moved"} eventType
 * @returns {string | null}
 */
function pickRecipient(task, eventType) {
  const stage = String(task.stage || "");

  if (eventType === "moved" && stage === "COMPLETE") {
    return recipients.Patrick;
  }

  if (eventType === "created") {
    if (stage === "INTAKE" || stage === "QC") return recipients.Patrick;
    if (stage === "PRINT") return recipients.Printer;
  }

  return null;
}

/**
 * @param {Record<string, unknown> & { ageHours?: number; thresholdHours?: number }} task
 */
async function sendStuckTaskNotification(task) {
  try {
    const to = recipients.Patrick;
    const subject = `[Cheeky OS] STUCK TASK — ${task.stage}`;
    const body = [
      "Cheeky OS — stuck task alert",
      "",
      `Title: ${task.title}`,
      `Owner: ${task.owner}`,
      `Stage: ${task.stage}`,
      `Age (hours): ${Number(task.ageHours || 0).toFixed(2)}`,
      `Threshold (hours): ${task.thresholdHours}`,
    ].join("\n");

    const out = await sendEmail({ to, subject, body });
    const ok = out && out.success === true;
    try {
      logEvent(ok ? "notification_sent" : "notification_failed", {
        kind: "stuck_task",
        taskId: task.id,
        stage: task.stage,
      });
    } catch (_) {}
    return out;
  } catch (err) {
    const e = err instanceof Error ? err : new Error(String(err));
    try {
      logEvent("notification_failed", { kind: "stuck_task", message: e.message });
    } catch (_) {}
    return { success: false, error: "NOTIFY_FAILED", message: e.message };
  }
}

module.exports = {
  sendTaskNotification,
  sendStuckTaskNotification,
};
