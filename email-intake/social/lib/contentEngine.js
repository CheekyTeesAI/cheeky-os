"use strict";

/**
 * Social content pipeline: Generate → Adapt → Score → Store.
 */

const { getDb } = require("./db");
const { scoreBrand, passThreshold } = require("./brandGuard");
const { adaptAll } = require("./platformAdapter");

const CORE_TAGS =
  "#CheekyTees, #CustomTees, #UpstateSC, #FountainInn, #BestInSC, #ScreenPrinting, #TeamApparel";

function buildHashtags(customExtra) {
  const extra = String(customExtra || "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 3)
    .map((t) => (t.startsWith("#") ? t : `#${t}`));
  const all = CORE_TAGS.split(",").map((t) => t.trim()).concat(extra);
  const uniq = [...new Set(all)];
  return uniq.slice(0, 10).join(", ");
}

function buildMasterCaption(variant, attempt) {
  const bump = attempt > 0 ? " This week only—lock your spot fast." : "";
  return (
    `🦊 Cheeky Tees in Fountain Inn fuels Upstate SC teams with crisp custom apparel.${bump} ` +
    `DM us or call 864-498-3475—and mention this post for priority quoting. ` +
    `Link in bio for ideas. Proudly serving Greenville + Upstate SC. ` +
    `(Batch: ${variant})`
  );
}

async function generateOnePost(prisma, scheduledDate, postType, idx) {
  let attempt = 0;
  let masterCaption = "";
  let hashtagsStr = "";
  let brandScore = 0;

  while (attempt < 3) {
    masterCaption = buildMasterCaption(`${postType}-${idx}`, attempt);
    hashtagsStr = buildHashtags(
      idx % 2 === 0 ? "FridayNightLights, PlayerPacks" : "CoachGifts"
    );
    brandScore = scoreBrand(masterCaption, hashtagsStr);
    if (passThreshold(brandScore)) break;
    attempt += 1;
  }

  const platforms = adaptAll(masterCaption, hashtagsStr);

  const row = await prisma.socialPost.create({
    data: {
      scheduledDate,
      status: "draft",
      masterCaption,
      igCaption: platforms.igCaption,
      fbCaption: platforms.fbCaption,
      xCaption: platforms.xCaption,
      liCaption: platforms.liCaption,
      hashtags: hashtagsStr,
      postType,
      engagementScore: brandScore,
      isEvergreen: postType === "evergreen"
    }
  });

  return { post: row, brandScore, attempts: attempt + 1 };
}

/**
 * @param {{ count?: number }} opts
 */
async function runBatch(opts) {
  const prisma = getDb();
  const count = Math.min(14, Math.max(1, Number(opts.count) || 7));
  const now = new Date();

  const created = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() + i + 1);
    const types = ["team-shoutout", "restock", "evergreen", "event-teaser"];
    const postType = types[i % types.length];
    const r = await generateOnePost(prisma, d, postType, i);
    created.push(r);
  }

  return {
    ok: true,
    generated: created.length,
    posts: created.map((c) => ({
      id: c.post.id,
      scheduledDate: c.post.scheduledDate,
      engagementScore: c.brandScore,
      attempts: c.attempts
    }))
  };
}

module.exports = { runBatch, buildHashtags, buildMasterCaption };
