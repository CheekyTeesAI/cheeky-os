"use strict";

/**
 * Platform-specific caption variants from master caption + hashtags.
 */

const fs = require("fs");
const path = require("path");

function loadPromptHints() {
  const p = path.join(__dirname, "..", "templates", "platformAdapter.prompt");
  try {
    return fs.readFileSync(p, "utf8");
  } catch (_e) {
    return "";
  }
}

function extractHashtagList(hashtagsComma) {
  return String(hashtagsComma || "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}

function toInstagram(masterCaption, hashtagsComma) {
  const tags = extractHashtagList(hashtagsComma);
  const visual = "Swipe the lineup 🦊";
  return `${visual}\n\n${masterCaption}\n\n${tags.join(" ")}`;
}

function toFacebook(masterCaption, hashtagsComma) {
  const tags = extractHashtagList(hashtagsComma).slice(0, 5);
  return (
    `${masterCaption} Shout out Fountain Inn + Upstate SC teams—we print fast and local.\n\n` +
    `${tags.join(" ")}`
  );
}

function toX(masterCaption, hashtagsComma) {
  const first = masterCaption.split(/\n/)[0] || masterCaption;
  const oneTag = extractHashtagList(hashtagsComma)[0] || "#CheekyTees";
  return `${first} ${oneTag}`;
}

function toLinkedIn(masterCaption, hashtagsComma) {
  const tags = extractHashtagList(hashtagsComma)
    .filter((t) => /#(CheekyTees|ScreenPrinting|TeamApparel)/i.test(t))
    .slice(0, 4);
  const clean = masterCaption.replace(/🦊/g, "").trim();
  return (
    `${clean}\n\nProfessional custom apparel and screen printing for Upstate SC organizations.\n\n` +
    `${tags.join(" ")}`
  );
}

function adaptAll(masterCaption, hashtagsComma) {
  void loadPromptHints();
  return {
    igCaption: toInstagram(masterCaption, hashtagsComma),
    fbCaption: toFacebook(masterCaption, hashtagsComma),
    xCaption: toX(masterCaption, hashtagsComma),
    liCaption: toLinkedIn(masterCaption, hashtagsComma)
  };
}

module.exports = { adaptAll, toInstagram, toFacebook, toX, toLinkedIn };
