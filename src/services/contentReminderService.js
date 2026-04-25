/**
 * At most one reminder / day while today’s post is not POSTED (and not skipped/rejected).
 */
const { getTodayPost, getReminderState, setReminderSent } = require("./contentStore");

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function shouldRemindForStatus(status) {
  const s = String(status || "").toUpperCase();
  if (s === "POSTED") return false;
  if (s === "SKIPPED" || s === "REJECTED") return false;
  return true;
}

/**
 * @returns {{ shouldRemind: boolean, message?: string, postId?: string, reason?: string }}
 */
function checkReminder() {
  const today = todayIsoDate();
  const row = getTodayPost();
  if (!row) {
    return { shouldRemind: false, reason: "no_post_yet" };
  }
  if (!shouldRemindForStatus(row.status)) {
    return { shouldRemind: false, reason: "complete_or_terminal" };
  }

  const st = getReminderState();
  if (st && st.lastReminderSentOn === today) {
    return { shouldRemind: false, reason: "already_reminded_today" };
  }

  setReminderSent(today);
  const hook = row.payload && row.payload.hook ? row.payload.hook.slice(0, 80) : "Approve → queue → post.";
  return {
    shouldRemind: true,
    postId: row.id,
    message: `Cheeky Tees — today’s post is ready (${row.status}). ${hook}`,
  };
}

module.exports = {
  checkReminder,
};
