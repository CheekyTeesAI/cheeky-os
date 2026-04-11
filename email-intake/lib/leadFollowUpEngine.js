"use strict";

/**
 * Lead follow-up queue (separate from estimate follow-up in followUpEngine.js).
 */
const { getLeads, updateLead } = require("./leadStore");
const { sendEmail } = require("./integrations/outlook");

function getFollowUps() {
  const now = Date.now();

  return getLeads().filter((lead) => {
    if (!lead.lastContact) return true;

    const diffHours =
      (now - new Date(String(lead.lastContact)).getTime()) / 3600000;

    return diffHours > 24 && String(lead.status || "") !== "closed";
  });
}

/**
 * @param {string} id
 */
function markContacted(id) {
  return updateLead(id, {
    lastContact: new Date().toISOString(),
    status: "contacted",
  });
}

async function runFollowUpCycle() {
  try {
    const leads = getFollowUps();
    for (const lead of leads) {
      if (!lead.email) continue;
      try {
        await sendEmail({
          to: String(lead.email),
          subject: "Quick follow-up from Cheeky Tees",
          body: `Hey ${lead.name || "there"} — we need a same-day decision today to hold your place; we have a few print slots open this week. Reply or approve estimate to lock your spot.

— Cheeky Tees
864-498-3475`,
        });
        updateLead(lead.id, {
          lastContact: new Date().toISOString(),
          status: "contacted",
        });
      } catch (err) {
        const e = err instanceof Error ? err : new Error(String(err));
        console.log(
          "Follow-up email failed for lead:",
          lead.id,
          e.message
        );
      }
    }
    return { success: true, count: leads.length };
  } catch (err) {
    const e = err instanceof Error ? err : new Error(String(err));
    console.error("Follow-up cycle crashed:", e.message);
    return { success: false, count: 0 };
  }
}

module.exports = {
  getFollowUps,
  markContacted,
  runFollowUpCycle,
};
