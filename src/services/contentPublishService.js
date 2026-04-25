/**
 * Publish — PREVIEW by default; MANUAL = owner posts; AUTO gated by env (Phase 2 stub).
 */
const { getPostById } = require("./contentStore");

function buildPreview(post) {
  const p = post.payload || post;
  const lines = [
    p.hook ? `HOOK: ${p.hook}` : "",
    "",
    p.caption || "",
    "",
    (p.hashtags || []).join(" "),
    "",
    `CTA: ${p.CTA || p.callToAction || ""}`,
  ].filter(Boolean);
  return lines.join("\n");
}

/**
 * @param {string} postId
 * @param {"PREVIEW"|"MANUAL"|"AUTO"} mode
 */
function publishPost(postId, mode) {
  const m = String(mode || "PREVIEW").toUpperCase();
  const row = getPostById(postId);
  if (!row) {
    return { success: false, mode: m, platform: null, preview: null, error: "not_found" };
  }

  const preview = buildPreview(row);

  if (m === "PREVIEW") {
    return {
      success: true,
      mode: "PREVIEW",
      platform: (row.payload && row.payload.platform) || ["INSTAGRAM", "FACEBOOK"],
      preview,
      error: null,
    };
  }

  if (row.status !== "APPROVED" && row.status !== "POSTED") {
    return {
      success: false,
      mode: m,
      platform: ["INSTAGRAM", "FACEBOOK"],
      preview,
      error: "approve_before_manual_or_auto",
    };
  }

  if (m === "MANUAL") {
    return {
      success: true,
      mode: "MANUAL",
      platform: (row.payload && row.payload.platform) || ["INSTAGRAM", "FACEBOOK"],
      preview,
      note: "Copy preview to Instagram/Facebook. No auto-post (safe default).",
      error: null,
    };
  }

  if (m === "AUTO") {
    const allow = String(process.env.CHEEKY_SOCIAL_AUTO_POST || "").toLowerCase() === "true";
    const token = String(process.env.META_PAGE_ACCESS_TOKEN || "").trim();
    if (!allow || !token) {
      return {
        success: false,
        mode: "AUTO",
        platform: ["INSTAGRAM", "FACEBOOK"],
        preview,
        error: "auto_disabled_set_CHEEKY_SOCIAL_AUTO_POST_and_META_PAGE_ACCESS_TOKEN",
      };
    }
    return {
      success: false,
      mode: "AUTO",
      platform: ["INSTAGRAM", "FACEBOOK"],
      preview,
      error: "meta_api_not_wired_phase2_stub",
    };
  }

  return { success: false, mode: m, platform: null, preview, error: "unknown_mode" };
}

module.exports = {
  publishPost,
  buildPreview,
};
