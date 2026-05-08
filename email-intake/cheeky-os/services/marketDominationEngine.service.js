"use strict";

const { loadOrdersForSales, quoteAmount, HIGH_VALUE_USD, BULK_QUANTITY } = require("./salesEngineV1.service");
const { effectiveTotal } = require("./cashRiskEngine.service");

const MARKET_DOMINATION_META = {
  status: "MARKET_DOMINATION_ACTIVE",
  programClientsIdentified: true,
  repeatRevenueBuilding: true,
  clientQualityIncreasing: true,
  nextAction: "Convert top 3 clients into programs this week.",
};

const SCHOOL_RE = /\b(school|district|pta|university|college|academy|alumni|campus|education|superintendent)\b/i;
const TEAM_RE =
  /\b(team|athletic|soccer|baseball|softball|basketball|volleyball|hockey|little\s*league|roster|varsity|jv\b|club\s*sport|youth\s*league)\b/i;
const CHURCH_RE = /\b(church|ministry|parish|congregation|worship|diocese|mission)\b/i;
const BUSINESS_RE = /\b(llc|inc\.?|corp|corporation|company|co\.|\bcorp\b|uniform|employee|staff|workwear|scrubs|clinic|hospital|construction|contractor|franchise)\b/i;
const UNIFORM_RE = /\b(uniform|polo|embroider|workwear|scrubs|safety\s*vest)\b/i;

function normEmail(e) {
  return String(e || "")
    .trim()
    .toLowerCase();
}

function orderQuantity(order) {
  const q = Number(order.quantity);
  return q > 0 ? q : 0;
}

function classifyType(blob) {
  const school = SCHOOL_RE.test(blob);
  const team = TEAM_RE.test(blob);
  const church = CHURCH_RE.test(blob);
  const biz = BUSINESS_RE.test(blob) || UNIFORM_RE.test(blob);
  const low = blob.toLowerCase();

  if (school && (low.includes("school") || low.includes("district"))) return "SCHOOL";
  if (school && team) return "SCHOOL";
  if (team) return "TEAM";
  if (church || biz) return "BUSINESS";
  if (school) return "SCHOOL";
  return "BUSINESS";
}

function signalStrength(order) {
  const blob = `${order.customerName || ""} ${order.email || ""} ${order.notes || ""} ${order.source || ""}`;
  let score = 0;
  if (SCHOOL_RE.test(blob)) score += 3;
  if (TEAM_RE.test(blob)) score += 2;
  if (CHURCH_RE.test(blob)) score += 2;
  if (BUSINESS_RE.test(blob) || UNIFORM_RE.test(blob)) score += 2;
  if (orderQuantity(order) >= BULK_QUANTITY) score += 2;
  const et = effectiveTotal(order);
  if (et >= HIGH_VALUE_USD) score += 1;
  return { blob, score };
}

function buildAgg(orders) {
  const m = new Map();
  for (const o of orders) {
    if (o.deletedAt) continue;
    const k = normEmail(o.email);
    if (!k) continue;
    const cur = m.get(k) || { count: 0, name: "", paidSum: 0 };
    cur.count += 1;
    cur.name = cur.name || o.customerName || "";
    cur.paidSum += Number(o.amountPaid || 0);
    m.set(k, cur);
  }
  return m;
}

/**
 * @param {{ orders: object[], customerAgg: Map }} loaded
 */
function identifyProgramClientsRaw(loaded) {
  const { orders, customerAgg } = loaded;
  const seen = new Map();

  for (const order of orders) {
    if (order.deletedAt) continue;
    const st = String(order.status || "").toUpperCase();
    if (st === "CANCELLED") continue;

    const email = normEmail(order.email);
    if (!email) continue;

    const { blob, score } = signalStrength(order);
    if (score < 2 && !(customerAgg.get(email) && customerAgg.get(email).count >= 2)) continue;

    const type = classifyType(blob);
    const quoteTot =
      (order.quotes && order.quotes.length ? Math.max(...order.quotes.map((q) => quoteAmount(q, order))) : 0) ||
      effectiveTotal(order);

    const row = seen.get(email) || {
      name: order.customerName || "",
      typeVotes: { SCHOOL: 0, TEAM: 0, BUSINESS: 0 },
      maxQuote: 0,
      orderCountSeen: 0,
      paidSumSeen: 0,
      signalScore: 0,
    };

    row.name = row.name || order.customerName || "";
    row.typeVotes[type] = (row.typeVotes[type] || 0) + 1 + Math.floor(score / 3);
    row.maxQuote = Math.max(row.maxQuote, quoteTot);
    row.orderCountSeen += 1;
    row.paidSumSeen += Number(order.amountPaid || 0);
    row.signalScore = Math.max(row.signalScore, score);
    seen.set(email, row);
  }

  const aggRows = customerAgg || buildAgg(orders);
  const out = [];

  for (const [email, row] of seen.entries()) {
    const cr = aggRows.get(email);
    const count = cr ? cr.count : row.orderCountSeen;
    const paidSum = cr ? cr.paidSum : row.paidSumSeen;
    const name = (cr && cr.name) || row.name || email;

    const dominantType =
      row.typeVotes.SCHOOL >= row.typeVotes.TEAM && row.typeVotes.SCHOOL >= row.typeVotes.BUSINESS
        ? "SCHOOL"
        : row.typeVotes.TEAM >= row.typeVotes.BUSINESS
          ? "TEAM"
          : "BUSINESS";

    let opportunityLevel = "LOW";
    if (count >= 3 || paidSum >= 3000 || (count >= 2 && row.signalScore >= 4)) opportunityLevel = "HIGH";
    else if (count >= 2 || paidSum >= 800 || row.signalScore >= 3) opportunityLevel = "MEDIUM";

    const avg = count > 0 ? paidSum / count : 0;
    const estimatedAnnualValue = Math.round(
      Math.max(paidSum * 2.2, row.maxQuote * 4, avg * Math.max(count, 2) * 3, opportunityLevel === "HIGH" ? 15000 : 5000, 2400) * 100
    ) / 100;

    out.push({
      name: name.trim() || email,
      type: dominantType,
      estimatedAnnualValue,
      opportunityLevel,
      email,
      _signalScore: row.signalScore,
    });
  }

  const priority = { HIGH: 3, MEDIUM: 2, LOW: 1 };
  out.sort((a, b) => {
    const d = priority[b.opportunityLevel] - priority[a.opportunityLevel];
    if (d !== 0) return d;
    return (b.estimatedAnnualValue || 0) - (a.estimatedAnnualValue || 0);
  });

  return out;
}

/**
 * @param {{ orders?: object[], customerAgg?: Map } | null} preloaded
 * @returns {Promise<Array<{ name: string, type: string, estimatedAnnualValue: number, opportunityLevel: string }>>}
 */
async function identifyProgramClients(preloaded = null) {
  const loaded =
    preloaded && preloaded.orders
      ? { orders: preloaded.orders, customerAgg: preloaded.customerAgg || buildAgg(preloaded.orders) }
      : await loadOrdersForSales();

  const full = identifyProgramClientsRaw(loaded);
  return full.map(({ email, _signalScore, ...rest }) => rest);
}

/**
 * @param {{ name: string, type: string, estimatedAnnualValue: number, opportunityLevel: string }} client
 */
function buildProgram(client) {
  const t = client.type || "BUSINESS";
  let programType = "SPIRIT_WEAR";
  let pricingModel = "Volume tiers + setup fee + annual price lock";
  let reorderCycle = "SEASONAL";

  if (t === "SCHOOL") {
    programType = UNIFORM_RE.test(client.name || "") ? "UNIFORM" : "SPIRIT_WEAR";
    pricingModel = "District/roster pricing + spirit store retail uplift";
    reorderCycle = "SEASONAL";
  } else if (t === "TEAM") {
    programType = "EVENT";
    pricingModel = "Season roster package + add-on fundraising SKUs";
    reorderCycle = "SEASONAL";
  } else {
    programType = "UNIFORM";
    pricingModel = "Employee kit + replacement pool + billed replenishment";
    reorderCycle = "MONTHLY";
  }

  if (client.opportunityLevel === "LOW") {
    reorderCycle = "ON DEMAND";
    pricingModel = "Pilot cohort pricing with path to contract rate";
  }

  return {
    programType,
    pricingModel,
    reorderCycle,
    revenuePotential: Math.round(Number(client.estimatedAnnualValue || 0) * 100) / 100,
  };
}

/**
 * @param {{ name: string, type: string, opportunityLevel?: string }} client
 */
function generateProgramOffer(client) {
  const t = client.type || "BUSINESS";
  const n = client.name || "your organization";

  const map = {
    SCHOOL: { title: "School Spirit Store", pitch: `${n}: always-on merch + reorder windows tied to enrollment peaks.` },
    TEAM: { title: "Team Season Package", pitch: `${n}: roster bundle + parent add-ons + playoff restock lane.` },
    BUSINESS: { title: "Employee Uniform Program", pitch: `${n}: sized roster + new-hire kit + compliance-friendly refresh cycle.` },
  };

  const extra =
    client.opportunityLevel === "HIGH"
      ? { alt: "Monthly Merch Drop", note: "Subscription-style drops for engaged audiences." }
      : null;

  return {
    primary: map[t] || map.BUSINESS,
    alternate: extra,
  };
}

/**
 * @param {{ name: string, type: string, opportunityLevel: string }} client
 */
function generateOutreachPlan(client) {
  const who = client.name || "there";
  const t = client.type || "BUSINESS";

  const firstByType = {
    SCHOOL: `Hi ${who} — we've been helping districts keep spirit and uniform orders predictable. Want a 10-min walkthrough of how other schools lock pricing for the year?`,
    TEAM: `Hey ${who} — we can structure your season so roster + parent extras ship in two waves with one deposit. Open to a quick call?`,
    BUSINESS: `${who} — we set up uniform programs so new hires and replacements don't stall. Worth comparing to how you buy today?`,
  };

  const followupSequence = [
    { dayOffset: 3, channel: "email", note: "Send one-pager: program type, tiers, and sample calendar." },
    { dayOffset: 7, channel: "email_or_sms", note: "Short check-in: confirm roster/size collection format." },
    { dayOffset: 14, channel: "call", note: "Offer pilot cohort (single department or single team)." },
  ];

  if (client.opportunityLevel === "HIGH") {
    followupSequence.unshift({
      dayOffset: 1,
      channel: "email",
      note: "VIP follow-up: reference last order quality and propose program anchor SKUs.",
    });
  }

  return {
    firstMessage: firstByType[t] || firstByType.BUSINESS,
    followupSequence,
    meetingGoal: "Secure agreement on program type, reorder cadence, and deposit/contract structure (no auto-send).",
  };
}

function enrichClientCore(c) {
  const core = {
    name: c.name,
    type: c.type,
    estimatedAnnualValue: c.estimatedAnnualValue,
    opportunityLevel: c.opportunityLevel,
  };
  const enriched = {
    ...core,
    program: buildProgram(core),
    offer: generateProgramOffer(core),
    outreach: generateOutreachPlan(core),
  };
  return enriched;
}

/**
 * @returns {Promise<object>}
 */
async function buildProgramsPayload(preloaded = null) {
  const loaded =
    preloaded && preloaded.orders
      ? { orders: preloaded.orders, customerAgg: preloaded.customerAgg || buildAgg(preloaded.orders) }
      : await loadOrdersForSales();

  const full = identifyProgramClientsRaw(loaded);
  const activePrograms = [];
  const potentialPrograms = [];

  for (const c of full) {
    const cr = loaded.customerAgg.get(c.email);
    const row = enrichClientCore(c);

    const active =
      cr &&
      ((cr.count >= 3 && cr.paidSum >= 500) ||
        (cr.count >= 2 && cr.paidSum >= 1500) ||
        (c._signalScore >= 5 && cr.count >= 2));

    if (active) activePrograms.push(row);
    else potentialPrograms.push(row);
  }

  const revenueForecast =
    Math.round(full.reduce((s, c) => s + Number(c.estimatedAnnualValue || 0), 0) * 0.35 * 100) / 100;

  return {
    activePrograms,
    potentialPrograms,
    revenueForecast,
    counts: {
      active: activePrograms.length,
      potential: potentialPrograms.length,
      identified: full.length,
    },
    ...MARKET_DOMINATION_META,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Operator slice — decision support only.
 */
async function buildProgramsOperatorBlock(preloaded = null) {
  const loaded =
    preloaded && preloaded.orders
      ? { orders: preloaded.orders, customerAgg: preloaded.customerAgg || buildAgg(preloaded.orders) }
      : await loadOrdersForSales();

  const full = identifyProgramClientsRaw(loaded);
  const high = full.filter((c) => c.opportunityLevel === "HIGH" || c.opportunityLevel === "MEDIUM");

  const clientsToConvert = high.slice(0, 12).map((c) => ({
    name: c.name,
    type: c.type,
    opportunityLevel: c.opportunityLevel,
    estimatedAnnualValue: c.estimatedAnnualValue,
    program: buildProgram(c),
    offerTitle: generateProgramOffer(c).primary.title,
    nextOutreach: generateOutreachPlan(c).firstMessage.slice(0, 160),
  }));

  const outreachNeeded = high
    .filter((c) => c.opportunityLevel === "HIGH")
    .slice(0, 8)
    .map((c) => ({
      name: c.name,
      type: c.type,
      meetingGoal: generateOutreachPlan(c).meetingGoal,
      followupSteps: generateOutreachPlan(c).followupSequence.length,
    }));

  const expectedRevenue = Math.round(
    high.slice(0, 10).reduce((s, c) => s + Number(c.estimatedAnnualValue || 0) * 0.25, 0) * 100
  ) / 100;

  return {
    clientsToConvert,
    outreachNeeded,
    expectedRevenue,
  };
}

module.exports = {
  identifyProgramClients,
  buildProgram,
  generateProgramOffer,
  generateOutreachPlan,
  buildProgramsPayload,
  buildProgramsOperatorBlock,
  MARKET_DOMINATION_META,
};
