/**
 * Light analytics from persisted posts.
 */
const { readDoc } = require("./contentStore");

function isoWeekKey(d) {
  const t = new Date(d);
  const day = (t.getUTCDay() + 6) % 7;
  t.setUTCDate(t.getUTCDate() - day + 3);
  const first = new Date(Date.UTC(t.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((t - first) / 86400000 - 3 + ((first.getUTCDay() + 6) % 7)) / 7);
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

function getContentStats() {
  const doc = readDoc();
  const posts = Array.isArray(doc.posts) ? doc.posts : [];
  const posted = posts.filter((p) => p && p.status === "POSTED");
  const now = new Date();
  const weekKey = isoWeekKey(now);
  let weeklyPosts = 0;
  const breakdownByType = {};

  const postedSorted = posted
    .map((p) => ({ p, t: p.postedAt || p.updatedAt }))
    .filter((x) => x.t)
    .sort((a, b) => String(a.t).localeCompare(String(b.t)));

  for (const { p, t } of postedSorted) {
    if (isoWeekKey(new Date(t)) === weekKey) weeklyPosts += 1;
    const typ = (p.payload && p.payload.postType) || "UNKNOWN";
    breakdownByType[typ] = (breakdownByType[typ] || 0) + 1;
  }

  let streak = 0;
  const dayMs = 86400000;
  for (let i = 0; i < 120; i += 1) {
    const d = new Date(now.getTime() - i * dayMs);
    const ds = d.toISOString().slice(0, 10);
    const has = posted.some((p) => p && String(p.date) === ds);
    if (has) streak += 1;
    else break;
  }

  return {
    weeklyPosts,
    streak,
    breakdownByType,
    weekKey,
    totalPosted: posted.length,
  };
}

module.exports = {
  getContentStats,
};
