/**
 * Bundle 14 — concrete actions from intelligence + follow-up context (pure).
 */

const {
  evaluatePaymentGate,
  captureOrderToGateInput,
} = require("./paymentGateService");

function normalizeName(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * @param {string} customerName
 * @param {unknown[]} followups
 */
function matchFollowup(customerName, followups) {
  const c = normalizeName(customerName);
  const list = Array.isArray(followups) ? followups : [];
  if (!c) return { match: false, priority: "high" };

  let matched = false;
  let anyCritical = false;
  for (const f of list) {
    if (!f || typeof f !== "object") continue;
    const fn = normalizeName(/** @type {{customerName?:string}} */ (f).customerName);
    if (!fn) continue;
    if (c === fn || c.includes(fn) || fn.includes(c)) {
      matched = true;
      const p = String(
        /** @type {{priority?:string}} */ (f).priority || ""
      ).toLowerCase();
      if (p === "critical") anyCritical = true;
    }
  }
  if (!matched) return { match: false, priority: "high" };
  return { match: true, priority: anyCritical ? "critical" : "high" };
}

/**
 * @param {{
 *   order: Record<string, unknown>,
 *   intelligence: Record<string, unknown>,
 *   followups: unknown[],
 * }} input
 */
function suggestActions(input) {
  const order = input && input.order ? input.order : {};
  const intelligence =
    input && input.intelligence ? input.intelligence : {};
  const followups =
    input && Array.isArray(input.followups) ? input.followups : [];

  const orderId = String(order.id != null ? order.id : "").trim();
  const customerName = String(
    order.customerName != null ? order.customerName : ""
  ).trim();
  const ps = String(
    order.paymentStatus != null ? order.paymentStatus : ""
  ).toLowerCase();
  const st = String(order.status != null ? order.status : "")
    .trim()
    .toUpperCase();

  const actions = [];
  const fu = matchFollowup(customerName, followups);
  const unpaid = ps !== "paid";

  if (unpaid || fu.match) {
    let priority = "high";
    if (fu.match && fu.priority === "critical") priority = "critical";
    else if (unpaid && ps === "not_paid") priority = "critical";
    actions.push({
      type: "followup",
      label: "Follow up customer",
      priority,
      target: { orderId, customerName },
      reason: fu.match
        ? "Matches active revenue follow-up"
        : "Payment not confirmed for this job",
    });
  }

  const rec = String(
    intelligence.recommendation != null ? intelligence.recommendation : ""
  );
  if (rec.includes("Collect deposit")) {
    actions.push({
      type: "invoice",
      label: "Create draft invoice",
      priority: "high",
      target: { orderId, customerName },
      reason: "Collect deposit before production",
    });
  }

  const riskLevel = String(
    intelligence.risk &&
      typeof intelligence.risk === "object" &&
      "level" in intelligence.risk
      ? /** @type {{level?:string}} */ (intelligence.risk).level
      : ""
  ).toLowerCase();
  if (riskLevel === "high") {
    actions.push({
      type: "review",
      label: "Review job details",
      priority: "high",
      target: { orderId, customerName },
      reason: "High risk on intelligence scan",
    });
  }

  if (st === "READY") {
    const gate = evaluatePaymentGate(captureOrderToGateInput(order));
    if (gate.allowedToProduce) {
      actions.push({
        type: "production",
        label: "Move to printing",
        priority: "medium",
        target: { orderId, customerName },
        reason: "Order READY with payment / deposit clear",
      });
    }
  }

  return { actions: actions.slice(0, 5) };
}

module.exports = { suggestActions, matchFollowup };
