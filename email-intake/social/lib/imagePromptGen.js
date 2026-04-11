"use strict";

/**
 * Builds image prompts for social posts (local Upstate SC brand vibe).
 */

const BASE =
  "Photorealistic 4K product shot of custom printed apparel, " +
  "local Upstate SC setting, Fountain Inn shop vibe, " +
  "fox branding visible, vibrant lighting, " +
  "no stock-photo feel, natural and candid.";

function buildImagePrompt(postType, themeHint) {
  const hint = themeHint ? ` Theme: ${themeHint}.` : "";
  return `${BASE}${hint} Post angle: ${postType}.`;
}

module.exports = { buildImagePrompt, BASE };
