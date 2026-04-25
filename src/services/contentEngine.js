/**
 * Cheeky Tees social content — creative, confident, slightly edgy. No auto-post in engine.
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const BRAND = {
  name: "Cheeky Tees",
  tagline: "Premium custom tees & merch — made local, made right.",
  locale: "Fountain Inn, SC",
};

const STRATEGY_TYPES = [
  { key: "BTS_PRINT", label: "Behind the scenes (printing)", postType: "REEL", difficulty: "EASY", timeToCreate: "5 min" },
  { key: "FINISHED_SHOWCASE", label: "Finished product showcase", postType: "PHOTO", difficulty: "EASY", timeToCreate: "5 min" },
  { key: "CUSTOMER_HIGHLIGHT", label: "Customer job highlight", postType: "CAROUSEL", difficulty: "MEDIUM", timeToCreate: "10 min" },
  { key: "BEFORE_AFTER", label: "Before / after", postType: "CAROUSEL", difficulty: "EASY", timeToCreate: "5 min" },
  { key: "SATISFYING_PRINT", label: "Satisfying print / press clip", postType: "REEL", difficulty: "EASY", timeToCreate: "5 min" },
  { key: "LOCAL_SPOTLIGHT", label: "Local business spotlight", postType: "PHOTO", difficulty: "MEDIUM", timeToCreate: "10 min" },
  { key: "QUICK_PROMO", label: "Quick promo", postType: "PHOTO", difficulty: "EASY", timeToCreate: "5 min" },
  { key: "FUNNY_RELATABLE", label: "Funny / relatable shirt content", postType: "PHOTO", difficulty: "EASY", timeToCreate: "5 min" },
];

function genId() {
  return `soc-${Date.now().toString(36)}-${crypto.randomBytes(3).toString("hex")}`;
}

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function loadShopHint() {
  try {
    const p = path.join(process.cwd(), "data", "shop-profile.json");
    if (!fs.existsSync(p)) return null;
    const j = JSON.parse(fs.readFileSync(p, "utf8") || "{}");
    return j && typeof j === "object" ? j : null;
  } catch (_e) {
    return null;
  }
}

function loadShopContext() {
  const ctx = { activeJobs: 0, sampleCustomer: null, hint: "" };
  try {
    const storePath = path.join(process.cwd(), "data", "cheeky-jobs.json");
    if (fs.existsSync(storePath)) {
      const doc = JSON.parse(fs.readFileSync(storePath, "utf8") || "{}");
      const jobs = Array.isArray(doc.jobs) ? doc.jobs : [];
      ctx.activeJobs = jobs.filter((j) => j && String(j.status || "").toUpperCase() !== "COMPLETE").length;
      const first = jobs.find((j) => j && (j.customer || j.customerName));
      if (first) ctx.sampleCustomer = String(first.customer || first.customerName || "").split(",")[0].trim() || null;
    }
  } catch (_e) {
    /* ignore */
  }
  if (ctx.activeJobs > 0) {
    ctx.hint = `${ctx.activeJobs} job(s) on the floor — film what’s actually moving.`;
  } else {
    ctx.hint = "Show the shop running — press, blanks, proofs, or a stack ready for pickup.";
  }
  return ctx;
}

function pickStrategyIndex(dateStr) {
  const d = dateStr || todayIsoDate();
  let hash = 0;
  for (let i = 0; i < d.length; i += 1) hash = (hash * 31 + d.charCodeAt(i)) >>> 0;
  return hash % STRATEGY_TYPES.length;
}

function buildCopy(strategy, variant, shopCtx) {
  const shop = loadShopHint();
  const city = shop && shop.city ? shop.city : BRAND.locale;
  const cust = shopCtx.sampleCustomer ? ` Shout-out energy to crews like ${shopCtx.sampleCustomer} (ask before tagging).` : "";

  const templates = {
    BTS_PRINT: {
      idea: `Print floor realness — ink, heat, rhythm.${shopCtx.hint ? ` ${shopCtx.hint}` : ""}`,
      shotList: [
        "10–15s: platens, squeegee, or DTG head doing work",
        "Stack of finished pieces with Cheeky fold",
        "Hands placing art — not stock footage energy",
      ],
      hook: "This is what “custom” looks like when it’s not a Canva mockup.",
      caption: `We don’t do “mystery fulfillment.” ${BRAND.name} — ${city} — real presses, real timelines, merch that looks expensive on camera because it is.${cust}\n\nNeed shirts that don’t embarrass your brand? We’ve got you.`,
      hashtags: ["CheekyTees", "ScreenPrinting", "CustomApparel", "SmallBusiness", "FountainInnSC", "ShopLife"],
      CTA: "Need shirts like this? DM us your quantity + deadline.",
    },
    FINISHED_SHOWCASE: {
      idea: "Hero the finished stack — texture, color accuracy, clean edges.",
      shotList: [
        "Flat lay: logo readable, lighting even",
        "Macro: ink sitting on fabric",
        "Optional: order slip blurred in frame for “real job” proof",
      ],
      hook: "If it doesn’t look good here, it won’t look good on your customer.",
      caption: `Fresh off the press at ${BRAND.name}. Premium blanks, crisp registration, zero “that’ll do” energy.${cust}\n\nLocal businesses: this is the bar.`,
      hashtags: ["CheekyTees", "CustomTees", "Merch", "Branding", "QualityMatters", "ShopLocal"],
      CTA: "Order link in bio — or DM “QUOTE” for same-day guidance.",
    },
    CUSTOMER_HIGHLIGHT: {
      idea: "Social proof: a real job story (permission first).",
      shotList: [
        "Carousel 1: garment + logo",
        "Carousel 2: in-the-wild or team wear",
        "Text overlay: turnaround + product type",
      ],
      hook: "Your neighborhood prints here for a reason.",
      caption: `Real shops don’t gamble on random vendors. ${BRAND.name} delivers proof-to-print discipline — tight color, clean edges, deadlines that don’t ghost you.${cust}`,
      hashtags: ["CheekyTees", "CustomerLove", "LocalBusiness", "CustomMerch", "ProofToPrint"],
      CTA: "Local businesses hit us up — DM your logo.",
    },
    BEFORE_AFTER: {
      idea: "Blank → branded. One swipe, zero fluff.",
      shotList: [
        "Same angle: blank vs printed",
        "Reels: hard cut on the beat",
        "Keep brand colors honest — no filters cheating contrast",
      ],
      hook: "Ideas are free. Execution is the product.",
      caption: `Proof, press, pickup — ${BRAND.name} makes your brand wearable.${cust}\n\nBring the file. We’ll tell you what’s realistic on your timeline.`,
      hashtags: ["CheekyTees", "BeforeAfter", "CustomPrint", "BrandBuilding", "Apparel"],
      CTA: "Need shirts like this? DM us.",
    },
    SATISFYING_PRINT: {
      idea: "Algorithm candy: peel, flash, stack — 8–12s vertical.",
      shotList: [
        "Macro peel or ink laydown",
        "Slow-mo optional",
        "End card: Cheeky subtle (not a billboard)",
      ],
      hook: "Turn the sound on. You’ll get it.",
      caption: `Satisfying for you, serious for your brand. ${BRAND.name} — premium custom apparel with main-character energy.${cust}`,
      hashtags: ["CheekyTees", "Satisfying", "Printing", "CustomApparel", "Reels", "SmallBusiness"],
      CTA: "Follow + save — new shop drops weekly.",
    },
    LOCAL_SPOTLIGHT: {
      idea: "Neighbor love — feature a local partner (permission).",
      shotList: [
        "Their world + your tee in frame",
        "Quote overlay: what they ordered",
        "Tag + CTA slide",
      ],
      hook: `We win when ${city} wins.`,
      caption: `${BRAND.name} prints merch for the businesses you actually use.${cust}\n\nTag someone who needs new shirts this quarter.`,
      hashtags: ["CheekyTees", "ShopLocal", "Community", "SmallBusiness", "FountainInnSC"],
      CTA: "Local businesses hit us up — link in bio.",
    },
    QUICK_PROMO: {
      idea: "One clear hook: planning season, rush window, or “new art” promo.",
      shotList: [
        "Bold product photo + one-line offer",
        "Deadline or capacity note (honest)",
        "Brand colors, minimal text",
      ],
      hook: "If you’re planning merch, read this once.",
      caption: `Events, launches, teams — ${BRAND.name} keeps proofing tight and timelines human.${cust}\n\nDM your in-hands date; we’ll back into production.`,
      hashtags: ["CheekyTees", "EventMerch", "CustomTees", "RushFriendly", "OrderNow"],
      CTA: "DM “TIMELINE” — we’ll tell you what’s possible.",
    },
    FUNNY_RELATABLE: {
      idea: "Print-shop truth — kind humor, insider jokes.",
      shotList: [
        "Sticky note, whiteboard, or caption-first post",
        "Keep it playful, not mean",
        "Invite comments (engagement bait that’s real)",
      ],
      hook: "No judgment. (Okay, a little judgment on 72dpi logos.)",
      caption: `We’ve seen every file type in existence. ${BRAND.name}: premium work, premium patience, zero attitude.${cust}\n\nDrop a 😭 if you’ve lived this.`,
      hashtags: ["CheekyTees", "PrinterLife", "Relatable", "SmallBusiness", "CustomApparel"],
      CTA: "Need shirts like this? DM us — we’ll fix your art gently.",
    },
  };

  const base = templates[strategy.key];
  if (!base) return null;

  const v = variant % 3;
  const hookTweak =
    v === 0
      ? base.hook
      : v === 1
        ? `${base.hook} (Vertical 9:16. Under 20s.)`
        : `${base.hook} — film it messy-real, not showroom-fake.`;

  return {
    ...base,
    hook: hookTweak,
    variant,
  };
}

/**
 * @param {object} [context] optional hints (date, strategyKey, etc.)
 */
function generatePost(context) {
  const c = context && typeof context === "object" ? context : {};
  const date = String(c.date || todayIsoDate());
  const shopCtx = loadShopContext();
  const idx = c.strategyKey
    ? STRATEGY_TYPES.findIndex((s) => s.key === String(c.strategyKey))
    : pickStrategyIndex(date);
  const safeIdx = idx >= 0 ? idx % STRATEGY_TYPES.length : pickStrategyIndex(date);
  const strategy = STRATEGY_TYPES[safeIdx];
  const variant = (pickStrategyIndex(date + "salt") + safeIdx) % 5;
  const copy = buildCopy(strategy, variant, shopCtx);
  const id = genId();

  const hashtags = (copy.hashtags || []).map((h) => (String(h).startsWith("#") ? h : `#${h}`));

  return {
    id,
    date,
    postType: strategy.postType,
    strategyKey: strategy.key,
    strategyLabel: strategy.label,
    idea: copy.idea,
    shotList: copy.shotList,
    caption: copy.caption,
    hook: copy.hook,
    hashtags,
    CTA: copy.CTA,
    callToAction: copy.CTA,
    platform: ["INSTAGRAM", "FACEBOOK"],
    status: "DRAFT",
    difficulty: strategy.difficulty,
    timeToCreate: strategy.timeToCreate,
    shopContext: {
      activeJobs: shopCtx.activeJobs,
      sampleCustomer: shopCtx.sampleCustomer,
    },
  };
}

/** @deprecated use generatePost */
function generateDailyPost(dateInput) {
  const p = generatePost({ date: dateInput || todayIsoDate() });
  const { status, id, ...rest } = p;
  return {
    ...rest,
    postType: p.postType,
    callToAction: p.CTA,
  };
}

module.exports = {
  generatePost,
  generateDailyPost,
  STRATEGY_TYPES,
  BRAND,
};
