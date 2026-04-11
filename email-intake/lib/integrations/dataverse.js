"use strict";

const axios = require("axios");
const config = require("../config");

/**
 * @param {Record<string, unknown>} payload
 * @returns {Promise<{
 *   success: boolean,
 *   mode: "live" | "stub",
 *   message: string,
 *   raw?: unknown
 * }>}
 */
async function postPayload(payload) {
  if (!config.hasDataverseWebhook) {
    return {
      success: true,
      mode: "stub",
      message: "POWER_AUTOMATE_DATAVERSE_WEBHOOK not configured (stub)",
    };
  }
  try {
    const res = await axios.post(config.dataverseWebhook, payload, {
      headers: { "Content-Type": "application/json" },
      timeout: 45000,
      validateStatus: () => true,
    });
    const ok = res.status >= 200 && res.status < 300;
    return {
      success: ok,
      mode: "live",
      message: ok ? `Accepted (${res.status})` : `HTTP ${res.status}`,
      raw: res.data,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[dataverse]", msg);
    return { success: false, mode: "stub", message: msg };
  }
}

/**
 * @param {{
 *   firstName?: string,
 *   lastName?: string,
 *   email?: string,
 *   phone?: string,
 *   company?: string,
 *   source?: string,
 *   notes?: string
 * }} data
 */
async function createOrUpdateCustomer(data) {
  const payload = {
    action: "upsert_customer",
    firstName: data.firstName ?? "",
    lastName: data.lastName ?? "",
    email: data.email ?? "",
    phone: data.phone ?? "",
    company: data.company ?? "",
    source: data.source ?? "cheeky_os_command",
    notes: data.notes ?? "",
  };
  return postPayload(payload);
}

/**
 * @param {{
 *   activityType?: string,
 *   subject?: string,
 *   status?: string,
 *   customerEmail?: string,
 *   details?: string,
 *   externalId?: string,
 *   source?: string
 * }} data
 */
async function createOrderActivity(data) {
  const payload = {
    action: "create_order_activity",
    activityType: data.activityType ?? "general",
    subject: data.subject ?? "",
    status: data.status ?? "Open",
    customerEmail: data.customerEmail ?? "",
    details: data.details ?? "",
    externalId: data.externalId ?? "",
    source: data.source ?? "cheeky_os_command",
  };
  return postPayload(payload);
}

/**
 * @param {{
 *   title?: string,
 *   taskType?: string,
 *   status?: string,
 *   priority?: string,
 *   owner?: string,
 *   dueDate?: string,
 *   customerEmail?: string,
 *   notes?: string,
 *   source?: string
 * }} data
 */
async function createTaskRecord(data) {
  const payload = {
    action: "create_task",
    title: data.title ?? "",
    taskType: data.taskType ?? "general",
    status: data.status ?? "New",
    priority: data.priority ?? "Normal",
    owner: data.owner ?? "",
    dueDate: data.dueDate ?? "",
    customerEmail: data.customerEmail ?? "",
    notes: data.notes ?? "",
    source: data.source ?? "cheeky_os_command",
  };
  return postPayload(payload);
}

module.exports = {
  createOrUpdateCustomer,
  createOrderActivity,
  createTaskRecord,
};
