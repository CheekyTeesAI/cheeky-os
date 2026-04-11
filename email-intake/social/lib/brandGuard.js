"use strict";

/**
 * Brand scoring v1.2 — 🦊, CTA, word cap, hashtag cap, "mention this post".
 */

function scoreBrand(caption, hashtagsStr) {
  const cap = String(caption || "");
  const tags = String(hashtagsStr || "");
  let score = 0;
  if (/🦊/.test(cap)) score += 20;
  if (/DM us|call 864-498-3475|Link in bio|Tag your crew/i.test(cap))
    score += 20;
  if (cap.split(/\s+/).filter(Boolean).length <= 60) score += 20;
  if (tags.split(",").map((t) => t.trim()).filter(Boolean).length <= 10)
    score += 20;
  if (/mention this post/i.test(cap)) score += 20;
  return Math.min(100, Math.max(0, score));
}

function passThreshold(score) {
  return score >= 85;
}

module.exports = { scoreBrand, passThreshold };
