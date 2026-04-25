const { runCollections } = require("./collectionsService");
const { scoreAndRank } = require("./actionEngine");
const { readAll, saveAuditLog } = require("./storageService");
const { sendEmail: sendEmailMock } = require("../mocks/resendMock");

function buildBriefText(input) {
  const lines = [];
  lines.push(`Cheeky AI Daily Brief — ${new Date().toLocaleString()}`);
  lines.push("");
  lines.push(`Revenue snapshot: $${Number(input.revenueToday || 0).toFixed(2)} today (estimated).`);
  lines.push(`Open collections balance: $${Number(input.openCollectionsTotal || 0).toFixed(2)} across ${input.openCollectionsCount} invoices.`);
  lines.push(`Top priority action: ${input.topAction || "No urgent action right now."}`);
  lines.push(`Action queue size: ${input.queueCount}`);
  lines.push("");
  lines.push("Next best move:");
  lines.push(`- ${input.nextAction || "Review dashboard and follow up on top overdue invoice."}`);
  return lines.join("\n");
}

async function sendBriefEmail({ to, subject, text }) {
  const apiKey = String(process.env.RESEND_API_KEY || "").trim();
  const from = String(process.env.RESEND_FROM || "Cheeky AI <noreply@cheekyteesllc.com>").trim();
  if (!apiKey) {
    return { ...(sendEmailMock({ to, subject, text })), mocked: true, reason: "RESEND_API_KEY missing" };
  }
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject,
        text,
      }),
    });
    if (!response.ok) {
      const detail = await response.text();
      return { ...(sendEmailMock({ to, subject, text })), mocked: true, reason: `resend_http_${response.status}`, detail };
    }
    const data = await response.json();
    return { success: true, mocked: false, provider: "resend", id: data && data.id ? data.id : null };
  } catch (error) {
    return {
      ...(sendEmailMock({ to, subject, text })),
      mocked: true,
      reason: error && error.message ? error.message : "resend_send_failed",
    };
  }
}

async function generateDailyBriefing(input) {
  const state = readAll();
  const collections = await runCollections({});
  const collectionItems = Array.isArray(collections.items) ? collections.items : [];
  const openCollectionsTotal = collectionItems.reduce((sum, item) => sum + Number(item.amount_owed || 0), 0);
  const queueSeed = collectionItems.map((item) => ({
    id: item.id,
    customer: item.customer,
    source: "collections",
    summary: item.message,
    value: Number(item.amount_owed || 0),
    urgency: Number(item.days_overdue || 0),
  }));
  const ranked = scoreAndRank(queueSeed);
  const top = ranked.queue && ranked.queue[0] ? ranked.queue[0] : null;
  const revenueToday = Number(input && input.revenueToday ? input.revenueToday : 0);

  const briefText = buildBriefText({
    revenueToday,
    openCollectionsTotal,
    openCollectionsCount: collectionItems.length,
    topAction: top ? `${top.action_type} ${top.customer} (${top.summary})` : null,
    queueCount: Array.isArray(ranked.queue) ? ranked.queue.length : 0,
    nextAction: top ? `${top.action_type} ${top.customer} today.` : null,
  });

  const to = String(
    (input && input.to) ||
      process.env.CHEEKY_ALERT_EMAIL ||
      process.env.CHEEKY_OS_ALERT_EMAIL ||
      process.env.NOTIFY_EMAIL ||
      "owner@cheekyteesllc.com"
  ).trim();
  const subject = "Cheeky AI Daily Revenue Brief";
  const delivery = await sendBriefEmail({ to, subject, text: briefText });

  Promise.resolve(
    saveAuditLog({
      event: "daily_brief_generated",
      mocked_delivery: delivery.mocked === true,
      to,
      queue_count: Array.isArray(ranked.queue) ? ranked.queue.length : 0,
      open_collections_total: openCollectionsTotal,
      store_counts: state && state.data ? {
        contacts: Array.isArray(state.data.contacts) ? state.data.contacts.length : 0,
        orders: Array.isArray(state.data.orders) ? state.data.orders.length : 0,
        auditLogs: Array.isArray(state.data.auditLogs) ? state.data.auditLogs.length : 0,
      } : null,
    })
  ).catch((error) => {
    console.warn("[briefingService] audit log failed:", error && error.message ? error.message : error);
  });

  return {
    success: true,
    mocked: delivery.mocked === true,
    delivery,
    brief_text: briefText,
    open_collections_total: openCollectionsTotal,
    open_collections_count: collectionItems.length,
    action_queue: ranked.queue || [],
    generated_at: new Date().toISOString(),
  };
}

module.exports = {
  generateDailyBriefing,
};
