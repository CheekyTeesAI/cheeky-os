/**
 * Daily flow: reuse today's row or generate fresh draft.
 */
const { generatePost } = require("./contentEngine");
const { createPost, getTodayPost } = require("./contentStore");

function getTodayContent() {
  const existing = getTodayPost();
  if (existing && existing.payload) {
    const post = { ...existing.payload, status: existing.status };
    return { fresh: false, record: existing, post };
  }

  const payload = generatePost({});
  const record = createPost({ payload, status: "DRAFT" });
  const post = { ...record.payload, status: record.status };
  return { fresh: true, record, post };
}

function forceGenerateToday() {
  const payload = generatePost({});
  const record = createPost({ payload, status: "DRAFT" });
  const post = { ...record.payload, status: record.status };
  return { fresh: true, record, post };
}

module.exports = {
  getTodayContent,
  forceGenerateToday,
};
