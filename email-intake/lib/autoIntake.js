"use strict";

const square = require("./integrations/square");
const outlook = require("./integrations/outlook");
const { generateTasksFromOrder, generateRevenueTasks } = require("./taskEngine");
const { logEstimate } = require("./estimateStore");
const { logIntake } = require("./intakeStore");
const { logEvent } = require("./eventStore");
const { createLead } = require("./leadStore");

const DEFAULT_LEAD_EMAIL = "customer.service@cheekyteesllc.com";

/**
 * Auto intake: create draft estimate + notify inbox (independent try/catch each).
 * @param {{ intent: string, data: Record<string, unknown>, raw: string }} parsed
 */
async function runAutoIntake(parsed) {
  const d = parsed.data || {};
  const raw = String(parsed.raw || "");
  const qty = Math.max(1, Number(d.quantity) || 12);
  const email = String(d.email || "").trim() || DEFAULT_LEAD_EMAIL;

  /** @type {Array<{ step: string; message: string; detail?: unknown }>} */
  const errors = [];

  console.log("📥 intake received:", raw.slice(0, 120));

  /** @type {Record<string, unknown> | null} */
  let lead = null;
  try {
    lead = createLead({
      firstName: d.firstName,
      email: d.email,
      phone: d.phone,
      raw: raw,
    });
  } catch (_) {}

  try {
    logEvent("intake_received", { intent: parsed.intent, raw: raw.slice(0, 500) });
  } catch (_) {}

  const estimatePayload = {
    firstName: String(d.firstName || "").trim(),
    lastName: String(d.lastName || "").trim(),
    email,
    items: [
      {
        name: "Custom Apparel",
        quantity: qty,
        unitAmount: 20,
      },
    ],
    note: raw,
  };

  /** @type {Record<string, unknown> | null} */
  let estimate = null;
  /** @type {Record<string, unknown> | null} */
  let emailResult = null;

  console.log("💰 estimate attempted");
  try {
    logEvent("estimate_attempted", { firstName: estimatePayload.firstName });
  } catch (_) {}

  try {
    estimate = await square.createDraftEstimate(estimatePayload);
    if (!estimate || estimate.success !== true) {
      errors.push({
        step: "estimate",
        message: String((estimate && estimate.message) || "estimate failed"),
        detail: estimate,
      });
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    estimate = {
      success: false,
      mode: "live",
      message: msg,
    };
    errors.push({ step: "estimate", message: msg });
  }

  console.log("📧 email attempted");
  try {
    logEvent("email_attempted", { to: DEFAULT_LEAD_EMAIL });
  } catch (_) {}

  try {
    emailResult = await outlook.sendEmail({
      to: DEFAULT_LEAD_EMAIL,
      subject: "New Cheeky OS Lead",
      body: raw,
    });
    if (!emailResult || emailResult.success !== true) {
      errors.push({
        step: "email",
        message: String((emailResult && emailResult.message) || "email failed"),
        detail: emailResult,
      });
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    emailResult = {
      success: false,
      mode: "live",
      message: msg,
    };
    errors.push({ step: "email", message: msg });
  }

  const estOk = estimate && estimate.success === true;
  const mailOk = emailResult && emailResult.success === true;
  const steps = [
    {
      name: "auto_estimate",
      success: estOk,
      mode: String((estimate && estimate.mode) || "stub"),
      message: String((estimate && estimate.message) || ""),
    },
    {
      name: "auto_notify_email",
      success: mailOk,
      mode: String((emailResult && emailResult.mode) || "stub"),
      message: String((emailResult && emailResult.message) || ""),
    },
  ];

  const modes = new Set(steps.map((s) => s.mode));
  let mode = "stub";
  if (modes.has("live") && modes.has("stub")) mode = "mixed";
  else if (modes.has("live")) mode = "live";

  /** @type {Array<Record<string, unknown>>} */
  let tasks = [];
  if (String(parsed.intent || "") === "create_estimate") {
    try {
      tasks = generateTasksFromOrder(parsed);
      if (estOk) {
        const amount = estimatePayload.items.reduce(function (s, it) {
          return (
            s +
            (Number(it && it.quantity) || 0) * (Number(it && it.unitAmount) || 0)
          );
        }, 0);
        const customerName =
          String(d.firstName || "Customer").trim() || "Customer";
        const estId =
          estimate && estimate.estimateId != null ?
            String(estimate.estimateId)
          : `stub-${Date.now()}`;
        logEstimate({
          id: estId,
          customer: customerName,
          email,
          amount,
          status: "sent",
          createdAt: new Date().toISOString(),
          lastFollowUpAt: null,
          followUpLevel: 0,
        });
        try {
          logEvent("estimate_created", {
            estimateId: estId,
            amount,
            customer: customerName,
          });
        } catch (_) {}
        const revenue = generateRevenueTasks(customerName);
        tasks = revenue.concat(tasks);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[autoIntake] task generation", msg);
      errors.push({ step: "tasks", message: msg });
    }
  }

  const result = {
    success: true,
    estimate,
    email: emailResult,
    tasks,
    errors,
    lead,
    execution: {
      action: "AUTO_INTAKE",
      mode,
      steps,
    },
  };

  try {
    logIntake(raw, parsed, result);
  } catch (_) {}

  return result;
}

/** Intents that trigger paired estimate + notify email */
const AUTO_INTENTS = new Set(["create_estimate", "send_email"]);

function shouldAutoIntake(parsed) {
  return AUTO_INTENTS.has(String(parsed.intent || ""));
}

module.exports = {
  runAutoIntake,
  shouldAutoIntake,
};
