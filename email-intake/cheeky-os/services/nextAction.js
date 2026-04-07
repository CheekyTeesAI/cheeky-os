/**
 * Bundle 2 — single next action from followup + reactivation data (no extra Square calls).
 * Bundle 2.5 — buildNextAction(followups, buckets) for command center (single followups fetch).
 */

const { getRevenueFollowups } = require("./revenueFollowups");
const { getReactivationBuckets } = require("./reactivationBuckets");

function safeStr(v) {
  return v == null ? "" : String(v);
}

function parseLastOrderMs(iso) {
  if (!iso) return 0;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? t : 0;
}

const emptyTarget = () => ({ name: "", phone: "", email: "", id: "" });

/**
 * @param {{ unpaidInvoices?: object[], staleEstimates?: object[] }} followups
 * @param {{ hot?: object[], warm?: object[], cold?: object[] }} buckets
 */
function buildNextAction(followups, buckets) {
  const unpaid = Array.isArray(followups && followups.unpaidInvoices)
    ? followups.unpaidInvoices
    : [];
  const stale = Array.isArray(followups && followups.staleEstimates)
    ? followups.staleEstimates
    : [];
  const hotList = Array.isArray(buckets && buckets.hot) ? buckets.hot : [];

  if (unpaid.length > 0) {
    const inv = unpaid[0];
    const name = safeStr(inv.customerName) || "Unknown Customer";
    return {
      action: `Follow up invoice for ${name}`,
      type: "followup",
      target: {
        name,
        phone: safeStr(inv.phone),
        email: safeStr(inv.email),
        id: safeStr(inv.id),
      },
      reason: `Oldest unpaid invoice (${safeStr(inv.daysPastDue)} days past due)`,
    };
  }

  if (stale.length > 0) {
    const est = stale[0];
    const name = safeStr(est.customerName) || "Unknown Customer";
    return {
      action: `Follow up estimate for ${name}`,
      type: "followup",
      target: {
        name,
        phone: safeStr(est.phone),
        email: safeStr(est.email),
        id: safeStr(est.id),
      },
      reason: `Stale estimate / open order (${safeStr(est.daysOld)} days old)`,
    };
  }

  const hot = [...hotList];
  hot.sort(
    (a, b) => parseLastOrderMs(b.lastOrder) - parseLastOrderMs(a.lastOrder)
  );

  if (hot.length > 0) {
    const c = hot[0];
    const name = safeStr(c.name) || "Unknown Customer";
    return {
      action: `Contact ${name} — hot reactivation`,
      type: "outreach",
      target: {
        name,
        phone: safeStr(c.phone),
        email: safeStr(c.email),
        id: safeStr(c.email) || safeStr(c.phone) || safeStr(c.name),
      },
      reason: "Best recent customer in hot bucket (last order within 30 days)",
    };
  }

  return {
    action: "No urgent sales actions — proceed to production",
    type: "production",
    target: emptyTarget(),
    reason: "No unpaid invoices, stale estimates, or hot reactivation leads",
  };
}

/**
 * @returns {Promise<{
 *   action: string,
 *   type: string,
 *   target: { name: string, phone: string, email: string, id: string },
 *   reason: string
 * }>}
 */
async function getNextAction() {
  try {
    const [followups, buckets] = await Promise.all([
      getRevenueFollowups(),
      getReactivationBuckets(),
    ]);
    return buildNextAction(followups, buckets);
  } catch (err) {
    console.error("[nextAction] failed:", err.message || err);
    return {
      action: "No urgent sales actions — proceed to production",
      type: "production",
      target: emptyTarget(),
      reason: "Unable to load action data — defaulting to production focus",
    };
  }
}

module.exports = { getNextAction, buildNextAction };
