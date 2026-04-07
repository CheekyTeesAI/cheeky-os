/**
 * Bundle 2 — single next action from existing followup + reactivation data (no extra Square calls).
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

/**
 * @returns {Promise<{
 *   action: string,
 *   type: string,
 *   target: { name: string, phone: string, id: string },
 *   reason: string
 * }>}
 */
async function getNextAction() {
  const emptyTarget = () => ({ name: "", phone: "", id: "" });

  try {
    const [followups, buckets] = await Promise.all([
      getRevenueFollowups(),
      getReactivationBuckets(),
    ]);

    const unpaid = Array.isArray(followups.unpaidInvoices)
      ? followups.unpaidInvoices
      : [];
    const stale = Array.isArray(followups.staleEstimates)
      ? followups.staleEstimates
      : [];

    if (unpaid.length > 0) {
      const inv = unpaid[0];
      const name = safeStr(inv.customerName) || "Customer";
      return {
        action: `Follow up invoice for ${name}`,
        type: "followup",
        target: {
          name,
          phone: "",
          id: safeStr(inv.id),
        },
        reason: `Oldest unpaid invoice (${safeStr(inv.daysPastDue)} days past due)`,
      };
    }

    if (stale.length > 0) {
      const est = stale[0];
      const name = safeStr(est.customerName) || "Customer";
      return {
        action: `Follow up estimate for ${name}`,
        type: "followup",
        target: {
          name,
          phone: "",
          id: safeStr(est.id),
        },
        reason: `Stale estimate / open order (${safeStr(est.daysOld)} days old)`,
      };
    }

    const hot = Array.isArray(buckets.hot) ? [...buckets.hot] : [];
    hot.sort(
      (a, b) => parseLastOrderMs(b.lastOrder) - parseLastOrderMs(a.lastOrder)
    );

    if (hot.length > 0) {
      const c = hot[0];
      const name = safeStr(c.name) || "Customer";
      return {
        action: `Contact ${name} — hot reactivation`,
        type: "outreach",
        target: {
          name,
          phone: safeStr(c.phone),
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

module.exports = { getNextAction };
