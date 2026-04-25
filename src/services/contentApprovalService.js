/**
 * Approval gate — only APPROVED posts may enter the publish queue.
 */
const { getPostById, markApproved, setPostStatus } = require("./contentStore");

function approvePost(postId) {
  const p = getPostById(postId);
  if (!p) return { ok: false, error: "not_found" };
  const row = markApproved(postId);
  return { ok: Boolean(row), post: row };
}

function rejectPost(postId) {
  const row = setPostStatus(postId, "REJECTED");
  return { ok: Boolean(row), post: row };
}

function requestEdit(postId) {
  const row = setPostStatus(postId, "EDIT_REQUESTED");
  return { ok: Boolean(row), post: row };
}

module.exports = {
  approvePost,
  rejectPost,
  requestEdit,
};
