"use strict";

/**
 * AI Operator Brain — read-only context, deterministic + optional OpenAI briefs/commands.
 * No auto-send, no payments, no webhook changes.
 */

const path = require("path");

const BRIEF_TTL_MS = 5 * 60 * 1000;

/** @type {{ brief: object | null, mode: string | null, generatedAt: number }} */
let briefCache = { brief: null, mode: null, generatedAt: 0 };

function getPrisma() {
  try {
    return require(path.join(__dirname, "..", "..", "src", "lib", "prisma"));
  } catch (_e) {
    return null;
  }
}

/**
 * @param {() => Promise<any>} fn
 * @param {string} label
 * @param {string[]} rawWarnings
 */
async function warnOnFail(fn, label, rawWarnings) {
  try {
    return await fn();
  } catch (e) {
    rawWarnings.push(`${label}:${e && e.message ? e.message : String(e)}`);
    return null;
  }
}

/**
 * Classify owner command for safety (keyword-based; default APPROVAL_REQUIRED).
 * @param {string} command
 * @returns {{ category: string, reason?: string }}
 */
function classifyAICommand(command) {
  const c = String(command || "").trim();
  const low = c.toLowerCase();
  if (!low) return { category: "APPROVAL_REQUIRED", reason: "empty_command" };

  if (
    /bypass\s+deposit|skip\s+deposit|ignore\s+deposit|without\s+deposit|start\s+unpaid|false\s+deposit/i.test(
      c
    ) ||
    /delete\s+(?:all|records|database)|drop\s+table/i.test(c) ||
    /modify\s+(?:square\s+)?webhook|change\s+webhook|payment\s+webhook/i.test(c) ||
    /square\s+(?:payment|webhook)\s+(?:logic|code|handler)/i.test(c) ||
    /auto[\s-]*order\s+garment|order\s+garment\s+without|garment\s+order\s+now/i.test(c)
  ) {
    return { category: "BLOCKED", reason: "policy_gate" };
  }

  if (
    /\bsend\b(?:\s|$)/i.test(c) &&
    /message|email|sms|customer|invoice|pickup/i.test(c) &&
    !/draft|prepare|write a/i.test(low)
  ) {
    return { category: "APPROVAL_REQUIRED", reason: "outbound_send" };
  }
  if (/finalize\s+payment|charge\s+card|capture\s+payment|run\s+payment/i.test(c)) {
    return { category: "APPROVAL_REQUIRED", reason: "payment_action" };
  }
  if (/create\s+(?:and\s+)?send\s+invoice|send\s+invoice|issue\s+invoice/i.test(c)) {
    return { category: "APPROVAL_REQUIRED", reason: "invoice_send" };
  }
  if (/mark\s+.*complete|change\s+.*stage|advance\s+.*production|move\s+to\s+qc/i.test(c)) {
    return { category: "APPROVAL_REQUIRED", reason: "production_mutation" };
  }
  if (/\bassign\s+(?:work|task|jeremy|to\s+)/i.test(c)) {
    return { category: "APPROVAL_REQUIRED", reason: "assignment" };
  }

  if (/draft|prepare\s+a|write\s+a|compose\s+a/i.test(low)) {
    if (!/auto[\s-]*send|send\s+now|fire\s+and\s+forget/i.test(low)) {
      return { category: "DRAFT_ONLY", reason: "draft_request" };
    }
  }

  if (
    /summarize|summary|status|what's\s+stuck|stuck\s+orders?|list\s+|show\s+me|how\s+many|what\s+needs/i.test(
      low
    ) ||
    /what\s+should\s+i\s+do\s+first|first\s+today|print\s+next|recommend/i.test(low) ||
    /which\s+orders/i.test(low)
  ) {
    return { category: "READ_ONLY", reason: "read_or_advise" };
  }

  return { category: "APPROVAL_REQUIRED", reason: "unknown_default" };
}

/**
 * @returns {Promise<object>}
 */
async function buildAIOperatorContext() {
  const rawWarnings = /** @type {string[]} */ ([]);
  const { buildOwnerSummary } = require(path.join(__dirname, "ownerSummary.service"));

  let owner;
  try {
    owner = await buildOwnerSummary();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    rawWarnings.push("owner_summary_exception:" + msg);
    return {
      ok: false,
      timestamp: new Date().toISOString(),
      cash: { depositPaidToday: 0, ordersAwaitingDeposit: 0, balanceDue: 0 },
      cashflow: {
        cashOnHand: 0,
        expectedIncome7d: 0,
        obligations7d: 0,
        overdueTotal: 0,
        safeToSpend: 0,
        riskCount: 0,
      },
      production: { ready: 0, printing: 0, qc: 0, completed: 0, stuck: 0 },
      jeremy: { assigned: 0, activeClock: false, hoursToday: 0 },
      comms: { needsApproval: 0, approved: 0, errors: 0 },
      sales: {
        openOpportunities: 0,
        highPriority: 0,
        estimatedPipeline: 0,
        draftsWaiting: 0,
      },
      purchasing: {
        needsApproval: 0,
        blocked: 0,
        orderedNotReceived: 0,
        estimatedSpendPending: 0,
      },
      qc: { pending: 0, failed: 0, reprints: 0 },
      risks: ["Owner summary failed — see rawWarnings"],
      nextActions: [],
      rawWarnings,
    };
  }

  if (owner.warnings && owner.warnings.length) {
    rawWarnings.push(...owner.warnings.map((w) => String(w)));
  }

  const prisma = getPrisma();
  await warnOnFail(
    async () => {
      if (!prisma || !prisma.communicationApproval) return;
      await prisma.communicationApproval.count();
    },
    "comms_queue_probe",
    rawWarnings
  );

  await warnOnFail(async () => {
    if (!prisma || !prisma.order) return;
    await prisma.order.findFirst({
      where: {
        deletedAt: null,
        status: { in: ["PRODUCTION_READY", "PRINTING", "QC"] },
      },
      select: { id: true },
    });
  }, "production_board_probe", rawWarnings);

  return {
    ok: true,
    timestamp: owner.timestamp || new Date().toISOString(),
    cash: owner.cash || {},
    cashflow: owner.cashflow || {
      cashOnHand: 0,
      expectedIncome7d: 0,
      obligations7d: 0,
      overdueTotal: 0,
      safeToSpend: 0,
      riskCount: 0,
    },
    production: owner.production || {},
    jeremy: owner.jeremy || {},
    comms: owner.comms || {},
    sales: owner.sales || {},
    fulfillment: owner.fulfillment || {
      pickupReady: 0,
      shippingStaged: 0,
      needsReview: 0,
      completedToday: 0,
    },
    digest: owner.digest || {
      generatedToday: false,
      lastGeneratedAt: null,
      topPriorityCount: 0,
      riskCount: 0,
    },
    risks: Array.isArray(owner.risks) ? owner.risks : [],
    nextActions: Array.isArray(owner.nextActions) ? owner.nextActions : [],
    purchasing: owner.purchasing || {
      needsApproval: 0,
      blocked: 0,
      orderedNotReceived: 0,
      estimatedSpendPending: 0,
    },
    qc: owner.qc || { pending: 0, failed: 0, reprints: 0 },
    rawWarnings,
  };
}

/**
 * Enrichment for prompts only (not returned as API contract fields).
 */
async function gatherPromptEnrichment() {
  const out = {
    salesBrief: /** @type {object | null} */ (null),
  };
  try {
    const salesEng = require(path.join(__dirname, "salesOpportunityEngine.service"));
    out.salesBrief = await salesEng.buildSalesBrief();
  } catch (_e) {
    out.salesBrief = null;
  }
  return out;
}

function buildDeterministicBrief(ctx, enrichment) {
  const cash = ctx.cash || {};
  const prod = ctx.production || {};
  const comms = ctx.comms || {};
  const sales = ctx.sales || {};
  const jeremy = ctx.jeremy || {};

  const priorities = [];
  if (Number(cash.ordersAwaitingDeposit) > 0) {
    priorities.push(
      `Cash: ${cash.ordersAwaitingDeposit} order(s) awaiting deposit — review queue before production pressure`
    );
  }
  if (Number(ctx.production && ctx.production.stuck) > 0) {
    priorities.push(`Production: ${prod.stuck} job(s) flagged stuck — open production board`);
  }
  const na = ctx.nextActions && ctx.nextActions[0];
  if (na && na.label) priorities.push(`Next: ${na.label}`);

  const salesHead =
    enrichment &&
    enrichment.salesBrief &&
    typeof enrichment.salesBrief.headline === "string" &&
    enrichment.salesBrief.headline.trim();
  if (salesHead) priorities.push(`Sales: ${salesHead.slice(0, 160)}`);

  const headline =
    (ctx.risks && ctx.risks[0]) ||
    priorities[0] ||
    (na && na.label) ||
    "Shop status — review Owner Command Center";

  const recommendedActions = [];
  for (const a of ctx.nextActions || []) {
    if (a && a.label) recommendedActions.push(a.label);
  }
  if (recommendedActions.length < 3 && enrichment && enrichment.salesBrief) {
    const ra = enrichment.salesBrief.recommendedActions;
    if (Array.isArray(ra)) {
      for (const x of ra) {
        if (typeof x === "string" && x.trim()) recommendedActions.push(x.trim());
      }
    }
  }

  const uniq = [];
  const seen = new Set();
  for (const s of recommendedActions) {
    if (seen.has(s)) continue;
    seen.add(s);
    uniq.push(s);
  }

  const cashFocus = [];
  if (Number(cash.depositPaidToday) >= 0) {
    cashFocus.push(`Deposits recorded today: ${cash.depositPaidToday}`);
  }
  if (Number(cash.balanceDue) > 0) {
    cashFocus.push(`Estimated balance due (sampled orders): $${Number(cash.balanceDue).toFixed(0)}`);
  }

  const productionFocus = [];
  productionFocus.push(`Ready: ${prod.ready || 0} · Printing: ${prod.printing || 0} · QC: ${prod.qc || 0}`);
  if (Number(prod.stuck) > 0) productionFocus.push(`Stuck signals: ${prod.stuck}`);
  const fu = ctx.fulfillment || {};
  if (Number(fu.pickupReady) + Number(fu.shippingStaged) + Number(fu.needsReview) > 0) {
    productionFocus.push(
      `Fulfillment — pickup ${fu.pickupReady || 0} · ship staged ${fu.shippingStaged || 0} · review ${fu.needsReview || 0}`
    );
  }

  const salesFocus = [];
  salesFocus.push(`Open opportunities: ${sales.openOpportunities || 0} · High priority: ${sales.highPriority || 0}`);
  if (Number(sales.draftsWaiting) > 0) salesFocus.push(`Sales drafts waiting: ${sales.draftsWaiting}`);

  const out = {
    headline: String(headline).slice(0, 240),
    priorities: priorities.slice(0, 7),
    risks: (ctx.risks || []).map(String).slice(0, 12),
    recommendedActions: uniq.slice(0, 7),
    cashFocus: cashFocus.slice(0, 7),
    productionFocus: productionFocus.slice(0, 7),
    salesFocus: salesFocus.slice(0, 7),
  };
  if (jeremy.assigned > 0 && !jeremy.activeClock) {
    const j =
      "Jeremy has assigned work but is not clocked in — confirm floor status.";
    if (!out.priorities.includes(j)) out.priorities.unshift(j);
    if (out.priorities.length > 7) out.priorities.length = 7;
  }
  return out;
}

function parseJsonLoose(text) {
  const t = String(text || "").trim();
  if (!t) return null;
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fence ? fence[1].trim() : t;
  try {
    return JSON.parse(body);
  } catch {
    const i = body.indexOf("{");
    const j = body.lastIndexOf("}");
    if (i >= 0 && j > i) {
      try {
        return JSON.parse(body.slice(i, j + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

async function runOpenAiBrief(contextPayload, enrichment) {
  const key = String(process.env.OPENAI_API_KEY || "").trim();
  if (!key) return { ok: false, error: "no_openai_key" };
  let OpenAI;
  try {
    OpenAI = require("openai");
  } catch {
    return { ok: false, error: "openai_module_missing" };
  }
  const model = String(process.env.OPENAI_MODEL || "gpt-4.1-mini").trim() || "gpt-4.1-mini";
  const safeCtx = {
    ...contextPayload,
    rawWarnings: (contextPayload.rawWarnings || []).slice(0, 20),
  };
  const prompt = [
    "You are Cheeky OS operator AI for a print shop. Output ONLY valid JSON, no markdown.",
    "Use ONLY numbers and facts present in CONTEXT and SALES_BRIEF. Do not invent order IDs or amounts.",
    'Schema: {"headline":"string","priorities":["max7"],"risks":["..."],"recommendedActions":["max7"],"cashFocus":["..."],"productionFocus":["..."],"salesFocus":["..."]}',
    "Prioritize deposits, stuck production, and comms needing approval.",
    "CONTEXT:",
    JSON.stringify(safeCtx),
    "SALES_BRIEF (may be null):",
    JSON.stringify(enrichment && enrichment.salesBrief ? enrichment.salesBrief : null),
  ].join("\n");

  try {
    const client = new OpenAI({ apiKey: key });
    const response = await client.responses.create({
      model,
      input: prompt,
    });
    const text =
      typeof response.output_text === "string" && response.output_text.trim()
        ? response.output_text.trim()
        : "";
    const parsed = parseJsonLoose(text);
    if (!parsed || typeof parsed !== "object") return { ok: false, error: "bad_ai_json" };
    return { ok: true, brief: parsed, model };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

async function runOpenAiCommand(userCommand, classification, contextPayload, enrichment) {
  const key = String(process.env.OPENAI_API_KEY || "").trim();
  if (!key) return { ok: false, error: "no_openai_key" };
  let OpenAI;
  try {
    OpenAI = require("openai");
  } catch {
    return { ok: false, error: "openai_module_missing" };
  }
  const model = String(process.env.OPENAI_MODEL || "gpt-4.1-mini").trim() || "gpt-4.1-mini";
  const safeCtx = {
    ...contextPayload,
    rawWarnings: (contextPayload.rawWarnings || []).slice(0, 15),
  };
  const prompt = [
    "You assist the shop owner. Output ONLY valid JSON.",
    `COMMAND_CLASS: ${classification.category} (${classification.reason || ""})`,
    "Rules: Never claim you executed anything. Never instruct bypassing deposit or production gates.",
    'Schema: {"answer":"markdown or plain","proposedActions":[{"label":"","link":"","reason":""}]}',
    "proposedActions max 5; use links like /production.html /comms.html /sales.html /owner.html when relevant.",
    "Use ONLY facts from CONTEXT — if unknown, say so.",
    "OWNER_COMMAND:",
    userCommand,
    "CONTEXT:",
    JSON.stringify(safeCtx),
    "SALES_BRIEF:",
    JSON.stringify(enrichment && enrichment.salesBrief ? enrichment.salesBrief : null),
  ].join("\n");

  try {
    const client = new OpenAI({ apiKey: key });
    const response = await client.responses.create({ model, input: prompt });
    const text =
      typeof response.output_text === "string" && response.output_text.trim()
        ? response.output_text.trim()
        : "";
    const parsed = parseJsonLoose(text);
    if (!parsed || typeof parsed !== "object") return { ok: false, error: "bad_ai_json" };
    return { ok: true, data: parsed, model };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

function readOnlyAnswerFromContext(ctx, command) {
  const lines = [];
  const cash = ctx.cash || {};
  const prod = ctx.production || {};
  lines.push(
    `Deposits today: ${cash.depositPaidToday}. Awaiting deposit: ${cash.ordersAwaitingDeposit}. Balance due (est.): $${Number(cash.balanceDue || 0).toFixed(0)}.`
  );
  lines.push(
    `Production — ready ${prod.ready}, printing ${prod.printing}, QC ${prod.qc}, completed ${prod.completed}, stuck flags ${prod.stuck}.`
  );
  lines.push(
    `Comms — needs approval: ${ctx.comms && ctx.comms.needsApproval}. Sales — open: ${ctx.sales && ctx.sales.openOpportunities}, high priority: ${ctx.sales && ctx.sales.highPriority}.`
  );
  const fu = ctx.fulfillment || {};
  lines.push(
    `Fulfillment — pickup ready: ${fu.pickupReady || 0}, shipping staged: ${fu.shippingStaged || 0}, needs review: ${fu.needsReview || 0}, fulfilled today: ${fu.completedToday || 0}.`
  );
  const dg = ctx.digest || {};
  lines.push(
    `Digest — generated today: ${dg.generatedToday ? "yes" : "no"} · priorities recorded: ${dg.topPriorityCount || 0} · risks recorded: ${dg.riskCount || 0}.`
  );
  const cf = ctx.cashflow || {};
  const cfUsd = (c) =>
    (Math.round(Number(c || 0)) / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
  lines.push(
    `Cashflow sentinel — on hand ${cfUsd(cf.cashOnHand)} · expected income 7d ${cfUsd(cf.expectedIncome7d)} · obligations 7d ${cfUsd(cf.obligations7d)} · overdue ${cfUsd(cf.overdueTotal)} · safe-to-spend (capped) ${cfUsd(cf.safeToSpend)} · risk signals ${cf.riskCount || 0}. See /cashflow.html.`
  );
  const pu = ctx.purchasing || {};
  lines.push(
    `Purchasing — needs approval ${pu.needsApproval || 0}, blocked ${pu.blocked || 0}, ordered not received ${pu.orderedNotReceived || 0}, est. spend pending $${((pu.estimatedSpendPending || 0) / 100).toFixed(0)}. /purchasing.html`
  );
  const qx = ctx.qc || {};
  lines.push(
    `QC — open PENDING checks ${qx.pending || 0}, orders w/ latest FAIL ${qx.failed || 0}, open reprint plans ${qx.reprints || 0}. /qc.html`
  );
  if (ctx.nextActions && ctx.nextActions.length) {
    lines.push("Top actions: " + ctx.nextActions.map((a) => a.label).join("; "));
  } else {
    lines.push("No prioritized next actions from Owner summary.");
  }
  lines.push(`(Your question: "${String(command).slice(0, 200)}")`);
  return lines.join(" ");
}

/**
 * @param {{ refresh?: boolean }} opts
 */
async function getOperatorBrief(opts) {
  const refresh = !!(opts && opts.refresh);
  const now = Date.now();
  if (!refresh && briefCache.brief && now - briefCache.generatedAt < BRIEF_TTL_MS) {
    return {
      ok: true,
      mode: briefCache.mode || "fallback",
      brief: briefCache.brief,
      timestamp: new Date().toISOString(),
      cached: true,
      cacheAgeMs: now - briefCache.generatedAt,
    };
  }

  const ctx = await buildAIOperatorContext();
  const enrichment = await gatherPromptEnrichment();
  const fallback = buildDeterministicBrief(ctx, enrichment);

  const aiTry = await runOpenAiBrief(ctx, enrichment);
  if (aiTry.ok && aiTry.brief) {
    const brief = {
      headline: String(aiTry.brief.headline || fallback.headline).slice(0, 400),
      priorities: Array.isArray(aiTry.brief.priorities)
        ? aiTry.brief.priorities.map(String).slice(0, 7)
        : fallback.priorities,
      risks: Array.isArray(aiTry.brief.risks) ? aiTry.brief.risks.map(String).slice(0, 12) : fallback.risks,
      recommendedActions: Array.isArray(aiTry.brief.recommendedActions)
        ? aiTry.brief.recommendedActions.map(String).slice(0, 7)
        : fallback.recommendedActions,
      cashFocus: Array.isArray(aiTry.brief.cashFocus)
        ? aiTry.brief.cashFocus.map(String).slice(0, 7)
        : fallback.cashFocus,
      productionFocus: Array.isArray(aiTry.brief.productionFocus)
        ? aiTry.brief.productionFocus.map(String).slice(0, 7)
        : fallback.productionFocus,
      salesFocus: Array.isArray(aiTry.brief.salesFocus)
        ? aiTry.brief.salesFocus.map(String).slice(0, 7)
        : fallback.salesFocus,
    };
    briefCache = { brief, mode: "ai", generatedAt: Date.now() };
    return {
      ok: true,
      mode: "ai",
      brief,
      timestamp: new Date().toISOString(),
      cached: false,
    };
  }

  briefCache = { brief: fallback, mode: "fallback", generatedAt: Date.now() };
  return {
    ok: true,
    mode: "fallback",
    brief: fallback,
    timestamp: new Date().toISOString(),
    cached: false,
    note: aiTry.error || "deterministic",
  };
}

function involvesSquareCommand(command) {
  const low = String(command || "").toLowerCase();
  return (
    /\bsquare\b/i.test(low) ||
    /\binvoice\b/i.test(low) ||
    /\bestimate\b/i.test(low) ||
    /payment\s+status/i.test(low) ||
    /balance\s+due/i.test(low) ||
    /deposit\s+request/i.test(low) ||
    /financial\s+summary/i.test(low) ||
    /customer\s+balance/i.test(low)
  );
}

function extractOrderIdHint(text) {
  const m = String(text || "").match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  return m ? m[0] : null;
}

/**
 * Fulfillment intents — staging/drafts only; blocks auto-label and auto-send.
 * @param {string} commandStr
 */
async function runFulfillmentAICommand(commandStr) {
  const low = commandStr.toLowerCase();
  if (
    /(buy|purchase)\s+(a\s+)?(shipping\s+)?label|auto[\s-]*(buy|purchase).*label|label\s+automatically/i.test(
      commandStr
    )
  ) {
    return {
      ok: true,
      commandType: "BLOCKED",
      fulfillmentCommand: true,
      answer:
        "Label purchase is blocked — Cheeky OS never auto-buys shipping labels. Use Fulfillment + Pirate Ship manually.",
      proposedActions: [{ label: "Fulfillment board", link: "/fulfillment.html", reason: "Staging only" }],
      requiresApproval: true,
      safeToAutoExecute: false,
    };
  }
  if (/auto[\s-]*send.*(pickup|customer)|send\s+(pickup\s+)?(text|sms|email)s?\s+automatically/i.test(low)) {
    return {
      ok: true,
      commandType: "BLOCKED",
      fulfillmentCommand: true,
      answer: "Auto-sending customer messages is blocked — drafts go to Comms for approval.",
      proposedActions: [{ label: "Comms queue", link: "/comms.html" }],
      requiresApproval: true,
      safeToAutoExecute: false,
    };
  }
  if (/ship(\s+out)?\s+unpaid|mark.*shipped.*unpaid|shipped?\s+without\s+pay/i.test(low)) {
    return {
      ok: true,
      commandType: "BLOCKED",
      fulfillmentCommand: true,
      answer: "Fulfilling unpaid orders from AI chat is blocked — settle balance in Owner / Square workflows.",
      proposedActions: [{ label: "Owner center", link: "/owner.html" }],
      requiresApproval: true,
      safeToAutoExecute: false,
    };
  }

  if (
    (/ready\s+for\s+pickup|pickup\s+ready/i.test(low) && /what|which|how|list|show|are|orders/i.test(low)) ||
    /what\s+orders\s+are\s+ready\s+for\s+pickup/i.test(low)
  ) {
    const fe = require(path.join(__dirname, "fulfillmentEngine.service"));
    const q = await fe.buildFulfillmentQueuePayload();
    const ids = q.pickupReady.map((r) => r.orderId).slice(0, 25);
    return {
      ok: true,
      commandType: "READ_ONLY",
      fulfillmentCommand: true,
      answer: `Pickup ready: ${q.metrics.pickupReady}. Order ids (max 25): ${ids.join(", ") || "none"}.`,
      proposedActions: [{ label: "Fulfillment board", link: "/fulfillment.html" }],
      requiresApproval: false,
      safeToAutoExecute: true,
      fulfillmentQueue: { metrics: q.metrics },
    };
  }

  if (
    /what\s+needs\s+shipping|what\s+orders?\s+(need|should)\s+ship|which.*\bship\b/i.test(low) ||
    (/need(s)?\s+shipping|shipping\s+staged/i.test(low) && /what|which|how|list|show/i.test(low))
  ) {
    const fe = require(path.join(__dirname, "fulfillmentEngine.service"));
    const q = await fe.buildFulfillmentQueuePayload();
    const rows = q.shippingStaged.slice(0, 25);
    const summary = rows.map((r) => `${r.orderId} (${r.fulfillmentMethod})`).join("; ") || "none";
    return {
      ok: true,
      commandType: "READ_ONLY",
      fulfillmentCommand: true,
      answer: `Shipping staged: ${q.metrics.shippingStaged}. ${summary}`,
      proposedActions: [{ label: "Fulfillment board", link: "/fulfillment.html" }],
      requiresApproval: false,
      safeToAutoExecute: true,
    };
  }

  if (/completed\s+orders?\s+need\s+review|fulfillment.*\breview\b|which.*\bneed\s+review/i.test(low)) {
    const fe = require(path.join(__dirname, "fulfillmentEngine.service"));
    const q = await fe.buildFulfillmentQueuePayload();
    const ids = q.needsReview.map((r) => r.orderId).slice(0, 25);
    return {
      ok: true,
      commandType: "READ_ONLY",
      fulfillmentCommand: true,
      answer: `Fulfillment needs review: ${q.metrics.needsReview}. Ids: ${ids.join(", ") || "none"}.`,
      proposedActions: [{ label: "Fulfillment board", link: "/fulfillment.html" }],
      requiresApproval: false,
      safeToAutoExecute: true,
    };
  }

  if (
    (/draft\s+pickup|pickup\s+messages/i.test(low) && /draft|prepare/i.test(low)) ||
    /draft\s+pickup\s+messages/i.test(low)
  ) {
    const fe = require(path.join(__dirname, "fulfillmentEngine.service"));
    const q = await fe.buildFulfillmentQueuePayload();
    const draft = require(path.join(__dirname, "customerMessageDraft.service"));
    let n = 0;
    for (const row of q.pickupReady.slice(0, 40)) {
      const r = await draft.createCustomerMessageDraft(row.orderId, "READY_FOR_PICKUP", "email");
      if (r && r.ok && !r.existing) n += 1;
    }
    return {
      ok: true,
      commandType: "DRAFT_ONLY",
      fulfillmentCommand: true,
      answer: `Draft pass — ${n} new READY_FOR_PICKUP drafts (${q.pickupReady.length} pickup-ready). Nothing sent.`,
      proposedActions: [{ label: "Comms queue", link: "/comms.html" }],
      requiresApproval: true,
      safeToAutoExecute: false,
    };
  }

  if (/pirate\s+ship|prepare\s+pirate|shipment\s+draft/i.test(low)) {
    const oid = extractOrderIdHint(commandStr);
    const fe = require(path.join(__dirname, "fulfillmentEngine.service"));
    if (oid) {
      const d = fe.buildPirateShipShipmentDraft(oid);
      return {
        ok: true,
        commandType: "DRAFT_ONLY",
        fulfillmentCommand: true,
        answer: "Local Pirate Ship draft JSON prepared — label not purchased.",
        proposedActions: [{ label: "Fulfillment board", link: "/fulfillment.html" }],
        requiresApproval: true,
        safeToAutoExecute: false,
        shipmentDraft: d,
      };
    }
    const q = await fe.buildFulfillmentQueuePayload();
    const drafts = q.shippingStaged.slice(0, 8).map((r) => fe.buildPirateShipShipmentDraft(r.orderId));
    return {
      ok: true,
      commandType: "DRAFT_ONLY",
      fulfillmentCommand: true,
      answer: `Prepared ${drafts.length} local shipment draft(s) for staged rows (no purchase).`,
      proposedActions: [{ label: "Fulfillment board", link: "/fulfillment.html" }],
      requiresApproval: true,
      safeToAutoExecute: false,
      shipmentDrafts: drafts,
    };
  }

  if (/draft\s+shipping\s+address|shipping\s+address\s+request|address\s+request/i.test(low)) {
    const oid = extractOrderIdHint(commandStr);
    const draft = require(path.join(__dirname, "customerMessageDraft.service"));
    if (!oid) {
      return {
        ok: true,
        commandType: "DRAFT_ONLY",
        fulfillmentCommand: true,
        answer: "Include an order UUID to draft SHIPPING_ADDRESS_NEEDED.",
        proposedActions: [{ label: "Fulfillment board", link: "/fulfillment.html" }],
        requiresApproval: true,
        safeToAutoExecute: false,
      };
    }
    const r = await draft.createCustomerMessageDraft(oid, "SHIPPING_ADDRESS_NEEDED", "email");
    return {
      ok: true,
      commandType: "DRAFT_ONLY",
      fulfillmentCommand: true,
      answer:
        r && r.ok
          ? `SHIPPING_ADDRESS_NEEDED draft ${r.existing ? "already present" : "created"} — not sent.`
          : "Could not create draft.",
      proposedActions: [{ label: "Comms queue", link: "/comms.html" }],
      requiresApproval: true,
      safeToAutoExecute: false,
    };
  }

  if (/\bmark\b.*\b(shipped|picked\s+up)\b/i.test(low) || /\bpicked\s+up\b.*\border\b/i.test(low)) {
    return {
      ok: true,
      commandType: "APPROVAL_REQUIRED",
      fulfillmentCommand: true,
      answer:
        "Use Fulfillment UI or PATCH /api/orders/:id/fulfillment/status — chat cannot mark shipped/picked up.",
      proposedActions: [{ label: "Fulfillment board", link: "/fulfillment.html" }],
      requiresApproval: true,
      safeToAutoExecute: false,
    };
  }

  return null;
}

/**
 * Quality control + reprint — read/draft only; never auto-pass from chat.
 * @param {string} commandStr
 */
function runQcAICommand(commandStr) {
  const low = commandStr.toLowerCase();
  if (/\bignore\s+qc\b|\bauto[\s-]*pass\s+qc\b|\bskip\s+qc\b/i.test(low)) {
    return {
      ok: true,
      commandType: "BLOCKED",
      qcCommand: true,
      answer:
        "Blocked — Cheeky OS does not auto-pass, skip, or ignore QC from chat. Record PASS, FAIL, or OVERRIDE_PASS with reason in /qc.html.",
      proposedActions: [{ label: "QC board", link: "/qc.html" }],
      requiresApproval: true,
      safeToAutoExecute: false,
    };
  }

  if (/\boverride\s+qc\s+failure\b|\bqc\s+override\b/i.test(low)) {
    return {
      ok: true,
      commandType: "APPROVAL_REQUIRED",
      qcCommand: true,
      answer:
        "Overrides require explicit action: POST /api/qc/:orderId with status OVERRIDE_PASS, checkedBy, and notes (documented reason).",
      proposedActions: [{ label: "QC", link: "/qc.html" }],
      requiresApproval: true,
      safeToAutoExecute: false,
    };
  }

  const draftQc = /\bprepare\s+reprint\s+plan\b|\bprepare\s+qc\s+summary\b/i.test(low);
  const readQc =
    draftQc ||
    /\bwhich\s+orders\s+failed\s+qc\b|\bfailed\s+qc\b|\bwhat\s+needs\s+reprint\b|\bneeds\s+reprint\b|\bblocking\s+completion\b|\bqc\s+fail/i.test(
      low
    );

  if (!readQc) return null;

  const qcEngine = require(path.join(__dirname, "qcEngine.service"));
  const qStore = require(path.join(__dirname, "qc.store"));
  const snap = qcEngine.ownerQcSnapshot();
  const lines = [
    `QC: ${snap.pending} pending inspection(s), ${snap.failed} order(s) with latest FAIL, ${snap.reprints} open reprint plan(s).`,
  ];
  const byOrder = new Map();
  for (const c of qStore.listChecks()) {
    const prev = byOrder.get(c.orderId);
    if (!prev || String(c.createdAt) > String(prev.createdAt)) byOrder.set(c.orderId, c);
  }
  for (const [, c] of byOrder) {
    if (String(c.status || "").toUpperCase() === "FAIL") latestFail.push(c.orderId);
  }
  if (latestFail.length && /\bfail|reprint|block/i.test(commandStr)) {
    lines.push(`Orders with latest QC FAIL: ${latestFail.slice(0, 12).join(", ")}.`);
  }

  if (draftQc) {
    return {
      ok: true,
      commandType: "DRAFT_ONLY",
      qcCommand: true,
      answer:
        lines.join(" ") +
        " Prepare reprint quantities from order line items + defects in the UI — no auto customer contact.",
      proposedActions: [{ label: "QC board", link: "/qc.html" }],
      requiresApproval: true,
      safeToAutoExecute: false,
    };
  }

  return {
    ok: true,
    commandType: "READ_ONLY",
    qcCommand: true,
    answer: lines.join(" "),
    proposedActions: [
      { label: "QC board", link: "/qc.html" },
      { label: "QC API", link: "/api/qc/board" },
    ],
    requiresApproval: false,
    safeToAutoExecute: true,
    qc: snap,
  };
}

/**
 * Purchasing / vendor plans — staging only; no auto-buy.
 * @param {string} commandStr
 */
function runPurchasingAICommand(commandStr) {
  const low = commandStr.toLowerCase();
  if (
    /buy\s+blanks\s+automatically|auto[\s-]*purchase|order\s+blanks\s+without(\s+a)?\s+deposit|pay\s+vendor\s+automatically/i.test(
      low
    )
  ) {
    return {
      ok: true,
      commandType: "BLOCKED",
      purchasingCommand: true,
      answer:
        "Blocked — Cheeky OS does not auto-purchase blanks or auto-pay vendors from chat. Stage plans in /purchasing.html only.",
      proposedActions: [{ label: "Purchasing control", link: "/purchasing.html" }],
      requiresApproval: true,
      safeToAutoExecute: false,
    };
  }

  if (
    /\bapprove\s+this\s+purchase\b|\bapprove\s+.*\bpurchase\s+plan\b|\bmark\s+(these\s+)?blanks\s+ordered\b|\bmark\s+.*\breceived\b/i.test(
      commandStr
    )
  ) {
    return {
      ok: true,
      commandType: "APPROVAL_REQUIRED",
      purchasingCommand: true,
      answer:
        "Use /purchasing.html or PATCH /api/purchasing/plans/:id/approve|ordered|receive — chat does not mutate purchase status.",
      proposedActions: [
        { label: "Purchasing UI", link: "/purchasing.html" },
        { label: "Plans JSON", link: "/api/purchasing/plans" },
      ],
      requiresApproval: true,
      safeToAutoExecute: false,
    };
  }

  const draftPur =
    /\bbuild\s+purchase\s+plan\b|\bprepare\s+carolina\s+made\b|\bprepare\s+vendor\s+order\s+email\b|\bvendor\s+order\s+email\b/i.test(
      low
    );
  const readPur =
    draftPur ||
    /\bblanks?\s+need\s+to\s+be\s+ordered\b|\bwhat\s+blanks\b|\bblocked\s+purchases\b|\bpurchases?\s+blocked\b|\bfunded\s+purchases\b|\bvendor\s+orders?\s+(waiting|pending)\b|\bpurchasing\b/i.test(
      low
    );

  if (!readPur) return null;

  const store = require(path.join(__dirname, "purchasing.store"));
  const plans = store.listPlans();
  const m = store.metrics();
  const lines = [
    `Purchasing metrics: draft ${m.draft}, needsApproval ${m.needsApproval}, approved ${m.approved}, ordered ${m.ordered}, blocked ${m.blocked}, received ${m.received}.`,
  ];
  const blocked = plans.filter((p) => String(p.status).toUpperCase() === "BLOCKED");
  const waitAppr = plans.filter((p) =>
    ["NEEDS_APPROVAL", "DRAFT"].includes(String(p.status || "").toUpperCase())
  );
  lines.push(`Blocked plans: ${blocked.length}. Awaiting approval: ${waitAppr.length}.`);
  if (/\bblocked\b/i.test(low)) {
    lines.push(
      (blocked.length
        ? blocked
            .slice(0, 10)
            .map((p) => `${String(p.orderId || "").slice(0, 8)}… ${p.blockedReason || p.status}`)
            .join("; ")
        : "none") + "."
    );
  }
  if (/\bfunded\b/i.test(low)) {
    const funded = plans.filter(
      (p) =>
        p.coveredByDeposit &&
        ["NEEDS_APPROVAL", "DRAFT", "APPROVED"].includes(String(p.status || "").toUpperCase())
    );
    lines.push(`Plans with deposit covering estimated blank cost (pending pipeline): ${funded.length}.`);
  }

  if (draftPur) {
    const tail =
      " Draft vendor email: Subject: Blank PO — Cheeky Tees. Body: Please confirm availability and ship [styles] per line items in plan [id]; reference Cheeky purchasing board.";
    return {
      ok: true,
      commandType: "DRAFT_ONLY",
      purchasingCommand: true,
      answer: lines.join(" ") + tail,
      proposedActions: [{ label: "Purchasing", link: "/purchasing.html" }],
      requiresApproval: true,
      safeToAutoExecute: false,
      metrics: m,
    };
  }

  return {
    ok: true,
    commandType: "READ_ONLY",
    purchasingCommand: true,
    answer: lines.join(" "),
    proposedActions: [{ label: "Purchasing", link: "/purchasing.html" }],
    requiresApproval: false,
    safeToAutoExecute: true,
    metrics: m,
  };
}

/**
 * Cashflow Sentinel — advisory only; blocks money movement / auto-pay language.
 * @param {string} commandStr
 */
function runCashflowAICommand(commandStr) {
  const low = commandStr.toLowerCase();

  if (
    /pay\s+.{0,60}\s+automatically|auto[\s-]*pay|autopay/i.test(low) ||
    /\bmove\s+money\b|\btransfer\s+funds\b|wire\s+money|ach\s+transfer/i.test(low) ||
    /ignore\s+taxes|skip\s+taxes|don'?t\s+pay\s+tax/i.test(low) ||
    /spend\s+(money\s+)?reserved\s+for\s+(blanks|payroll|tax)/i.test(low)
  ) {
    return {
      ok: true,
      commandType: "BLOCKED",
      cashflowCommand: true,
      answer:
        "Blocked — Cheeky OS does not auto-pay bills, move money, ignore taxes, or spend funds reserved for blanks/payroll/taxes. Use /cashflow.html to plan manually.",
      proposedActions: [{ label: "Cashflow sentinel", link: "/cashflow.html", reason: "Advisory ledger" }],
      requiresApproval: true,
      safeToAutoExecute: false,
    };
  }

  const draftCash =
    /cash\s+action\s+plan/i.test(low) ||
    /prepare\s+a\s+cash\s+action/i.test(low) ||
    /draft\s+a\s+vendor\s+delay|vendor\s+delay\s+message/i.test(low) ||
    /draft\s+a\s+customer\s+deposit|deposit\s+follow[\s-]?up/i.test(low);

  const mentionsCash =
    draftCash ||
    /\bbills?\b.*\bdue\b|\bdue\s+bills?\b/i.test(low) ||
    /\bcash\s+risk/i.test(low) ||
    /\bsafe\s+to\s+spend\b|\bcan\s+i\s+spend\b/i.test(low) ||
    /\bwhat\s+should\s+i\s+pay\s+first\b|\bpay\s+first\b/i.test(low) ||
    /\bcashflow\b|\brunway\b/i.test(low) ||
    /\boverdue\s+obligation/i.test(low);

  if (!mentionsCash) return null;

  const { buildCashflowSnapshot } = require(path.join(__dirname, "cashflowSentinel.service"));
  const snap = buildCashflowSnapshot();

  if (draftCash) {
    const steps = (snap.nextActions || []).slice(0, 6).join(" · ");
    let draft = "";
    if (/vendor\s+delay/i.test(low)) {
      draft =
        ' Vendor delay draft: "We are sequencing payroll, tax, and critical vendor items this week; we will remit by [DATE]. Thank you for your patience."';
    } else if (/deposit|follow[\s-]?up/i.test(low) && /customer/i.test(low)) {
      draft =
        ' Deposit follow-up draft: "To lock your production slot we need the deposit posted; once it clears we will confirm timeline. Thanks!"';
    }
    return {
      ok: true,
      commandType: "DRAFT_ONLY",
      cashflowCommand: true,
      answer: [
        `Plan (numbers): on hand ${snap.cashOnHandUsd}, expected income 7d ${snap.expectedIncome7dUsd}, obligations 7d ${snap.obligations7dUsd}, 14d ${snap.obligations14dUsd}, overdue ${snap.overdueTotalUsd}, safe-to-spend (capped) ${snap.safeToSpendUsd}.`,
        snap.warnings && snap.warnings.length ? `Warnings: ${snap.warnings.join("; ")}.` : "",
        steps ? `Suggested moves: ${steps}.` : "",
        draft,
      ]
        .filter(Boolean)
        .join(" "),
      proposedActions: [
        { label: "Cashflow sentinel", link: "/cashflow.html", reason: "Edit obligations / cash on hand" },
        { label: "Owner center", link: "/owner.html", reason: "Deposits + summary" },
      ],
      requiresApproval: true,
      safeToAutoExecute: false,
      cashflowSnapshot: snap,
    };
  }

  const parts = [
    `Cash on hand: ${snap.cashOnHandUsd}. Expected income (7d): ${snap.expectedIncome7dUsd}.`,
    `Obligations — 7d: ${snap.obligations7dUsd}; 14d: ${snap.obligations14dUsd}. Overdue: ${snap.overdueTotalUsd}.`,
    `Safe-to-spend (advisory, floor at zero): ${snap.safeToSpendUsd}.`,
  ];
  if (snap.warnings && snap.warnings.length) {
    parts.push(`Warnings: ${snap.warnings.join("; ")}.`);
  }
  if (/\bbills?\s+due\b|\bdue\s+bills?\b/i.test(low)) {
    const today = (snap.billsDueToday || [])
      .map((b) => `${b.name} ${b.amountUsd}`)
      .join("; ");
    const week = (snap.billsDue7d || [])
      .slice(0, 12)
      .map((b) => `${b.name} due ${b.dueDate} ${b.amountUsd}`)
      .join("; ");
    parts.push(`Due today: ${today || "none recorded."} Upcoming (7d window): ${week || "none recorded."}`);
  }
  if (/\brisk/i.test(low) && snap.risks && snap.risks.length) {
    parts.push(`Risks: ${snap.risks.join("; ")}.`);
  }
  if (/\bpay\s+first\b|\bpriorit/i.test(low)) {
    parts.push(
      "Pay-first heuristic: clear overdue, then due-today CRITICAL / TAX / PAYROLL, then other 7d obligations — totals above."
    );
  }
  if (/\bsafe\s+to\s+spend\b|\bcan\s+i\s+spend\b/i.test(low)) {
    parts.push(
      `Using recorded numbers, advisory safe-to-spend is ${snap.safeToSpendUsd}. If cash on hand is unknown, enter the operating balance in /cashflow.html before trusting spend guidance.`
    );
  }

  return {
    ok: true,
    commandType: "READ_ONLY",
    cashflowCommand: true,
    answer: parts.join(" "),
    proposedActions: [{ label: "Cashflow sentinel", link: "/cashflow.html" }],
    requiresApproval: false,
    safeToAutoExecute: true,
    cashflowSnapshot: snap,
  };
}

/**
 * Daily digest / morning brief — read & draft only unless owner uses POST /api/digest/generate.
 * @param {string} commandStr
 */
async function runDigestAICommand(commandStr) {
  const low = commandStr.toLowerCase();
  if (
    /send\s+everything\s+automatically|blast\s+all\s+customer|auto[\s-]*send\s+all/i.test(low) ||
    /ignore\s+stuck\s+paid|skip\s+deposit\s+gate|false\s+deposit/i.test(low) ||
    /bypass\s+cash\s+gate|ignore\s+cash\s+gate/i.test(low)
  ) {
    return {
      ok: true,
      commandType: "BLOCKED",
      digestCommand: true,
      answer:
        "That request is blocked — Cheeky OS does not auto-send everything, ignore stuck paid work, or bypass cash gates. Use digest + comms approvals.",
      proposedActions: [{ label: "Daily digest", link: "/digest.html", reason: "Human-controlled brief" }],
      requiresApproval: true,
      safeToAutoExecute: false,
    };
  }

  const mentionsDigest =
    /daily\s+digest|morning\s+(plan|brief)|today'?s\s+brief|owner\s+digest|control\s+brief/i.test(low);
  const doFirst = /what\s+should\s+i\s+do\s+first\s+today|do\s+first\s+today|first\s+thing\s+today/i.test(
    low
  );
  const risksQ = /today'?s\s+risks|what\s+are\s+today'?s\s+risks|risks\s+today/i.test(low);
  const draftReq =
    (/draft|prepare/i.test(low) && mentionsDigest) ||
    /prepare\s+morning\s+plan|draft\s+morning/i.test(low);

  if (!mentionsDigest && !doFirst && !risksQ && !draftReq) return null;

  const store = require(path.join(__dirname, "dailyDigests.store"));
  const { buildDailyDigest } = require(path.join(__dirname, "dailyDigest.service"));

  if (draftReq) {
    const d = await buildDailyDigest({ refreshAi: false });
    const pri = (d.topPriorities || []).join("; ") || "—";
    return {
      ok: true,
      commandType: "DRAFT_ONLY",
      digestCommand: true,
      answer: `Morning digest draft (not saved to history): ${d.headline}. Top moves: ${pri}. Open /digest.html and click Generate to persist.`,
      proposedActions: [
        { label: "Digest UI", link: "/digest.html", reason: "Save fresh digest when ready" },
        { label: "Owner center", link: "/owner.html", reason: "Tiles + next actions" },
      ],
      requiresApproval: true,
      safeToAutoExecute: false,
      digestPreview: {
        headline: d.headline,
        topPriorities: d.topPriorities,
        risks: (d.risks || []).slice(0, 8),
      },
    };
  }

  const key = store.digestDateKeyNY();
  const saved = store.getByDigestDate(key);
  const useFresh = /fresh|generate|rebuild|live/i.test(low);

  if (saved && saved.payloadJson && !useFresh && (mentionsDigest || doFirst)) {
    const d = saved.payloadJson;
    const pri = (d.topPriorities || []).join("; ") || "—";
    const riskLine = (d.risks || []).slice(0, 5).join("; ") || "—";
    let answer = `Today's stored digest (${d.date}): ${d.headline}. Priorities: ${pri}.`;
    if (risksQ) answer += ` Key risks: ${riskLine}.`;
    return {
      ok: true,
      commandType: "READ_ONLY",
      digestCommand: true,
      answer,
      proposedActions: [{ label: "Digest", link: "/digest.html" }, { label: "Owner", link: "/owner.html" }],
      requiresApproval: false,
      safeToAutoExecute: true,
      digestSummary: {
        headline: d.headline,
        topPriorities: d.topPriorities,
        risks: (d.risks || []).slice(0, 10),
      },
    };
  }

  const d = await buildDailyDigest({ refreshAi: useFresh });
  if (risksQ) {
    const rj = (d.risks || []).join("; ") || "No risks surfaced in brief.";
    return {
      ok: true,
      commandType: "READ_ONLY",
      digestCommand: true,
      answer: `Today's risk snapshot (live build): ${rj}`,
      proposedActions: [{ label: "Digest", link: "/digest.html" }],
      requiresApproval: false,
      safeToAutoExecute: true,
    };
  }
  const pri = (d.topPriorities || []).join("; ") || "—";
  return {
    ok: true,
    commandType: "READ_ONLY",
    digestCommand: true,
    answer: `Brief (live build): ${d.headline}. Start with: ${pri}`,
    proposedActions: [
      { label: "Digest", link: "/digest.html", reason: "Save for the team" },
      { label: "Production", link: "/production.html" },
    ],
    requiresApproval: false,
    safeToAutoExecute: true,
    digest: d,
  };
}

/**
 * @param {string} command
 * @param {object} ctx
 * @param {object} enrichment
 */
async function runOperatorCommand(command, ctx, enrichment) {
  const commandStr = String(command || "").trim();

  const qcHit = runQcAICommand(commandStr);
  if (qcHit) return qcHit;

  const purchasingHit = runPurchasingAICommand(commandStr);
  if (purchasingHit) return purchasingHit;

  const cashflowHit = runCashflowAICommand(commandStr);
  if (cashflowHit) return cashflowHit;

  const digestHit = await runDigestAICommand(commandStr);
  if (digestHit) return digestHit;

  const fulfillmentHit = await runFulfillmentAICommand(commandStr);
  if (fulfillmentHit) return fulfillmentHit;

  if (involvesSquareCommand(commandStr)) {
    const squareCmd = require(path.join(__dirname, "squareCommand.service"));
    const draftsStore = require(path.join(__dirname, "squareActionDrafts.store"));
    const sqClass = squareCmd.classifySquareCommand(commandStr);

    if (sqClass.category === "BLOCKED") {
      return {
        ok: true,
        commandType: "BLOCKED",
        squareCommand: sqClass,
        answer:
          "Square/payment safety: that action is blocked (charges, refunds, webhook edits, bypassing deposit, or destructive Square changes). Use Square Control for approved drafts only.",
        proposedActions: [{ label: "Square control", link: "/square.html", reason: sqClass.reason || "" }],
        requiresApproval: true,
        safeToAutoExecute: false,
      };
    }

    if (sqClass.category === "READ_ONLY") {
      const oid = squareCmd.extractOrderIdHint(commandStr);
      let answer;
      if (oid) {
        const st = await squareCmd.getOrderFinancialStatus(oid);
        const parts = [
          `Order ${st.orderId}: workflow status ${st.status || "—"}.`,
          `Amount paid: ${st.amountPaid}. Balance due (local): ${st.balanceDue}.`,
          `Deposit paid at: ${st.depositPaidAt || "—"}.`,
          `Square invoice id (local): ${st.squareInvoiceId || "—"}. Square order id: ${st.squareOrderId || "—"}.`,
        ];
        if (st.warnings && st.warnings.length) parts.push("Warnings: " + st.warnings.join("; "));
        answer = parts.join(" ");
      } else {
        answer =
          readOnlyAnswerFromContext(ctx, commandStr) +
          " For a specific order’s Square/local financial snapshot, include the order id.";
      }
      return {
        ok: true,
        commandType: "READ_ONLY",
        squareCommand: sqClass,
        answer,
        proposedActions: [
          { label: "Square control", link: "/square.html", reason: "Drafts & approvals" },
          { label: "Owner summary", link: "/owner.html", reason: "Cash & production" },
        ],
        requiresApproval: false,
        safeToAutoExecute: true,
      };
    }

    if (sqClass.category === "DRAFT_ONLY") {
      const type = squareCmd.inferSquareDraftType(commandStr);
      const oid = squareCmd.extractOrderIdHint(commandStr);
      const amtMatch = commandStr.match(/\$?\s*([\d,]+(?:\.\d+)?)/);
      const amount = amtMatch ? parseFloat(String(amtMatch[1]).replace(/,/g, "")) : 0;
      try {
        const out = draftsStore.upsertDraft({
          orderId: oid,
          customerId: null,
          type,
          amount: amount || 0,
          depositAmount: 0,
          lineItems:
            amount > 0
              ? [{ name: String(type).replace(/_/g, " "), quantity: 1, price: amount }]
              : [],
          notes: ("AI draft request: " + commandStr).slice(0, 3500),
        });
        return {
          ok: true,
          commandType: "SQUARE_DRAFT",
          squareCommand: sqClass,
          answer: `Local Square action draft saved (${type}, id ${out.draft.id}). Approve in Square Control, then create Square draft — nothing was sent or charged.`,
          proposedActions: [
            {
              label: "Open Square Control",
              link: "/square.html",
              reason: "Approve then create Square draft",
            },
          ],
          requiresApproval: true,
          safeToAutoExecute: false,
          draftId: out.draft.id,
        };
      } catch (e) {
        return {
          ok: true,
          commandType: "SQUARE_DRAFT",
          squareCommand: sqClass,
          answer: "Could not save draft: " + (e instanceof Error ? e.message : String(e)),
          proposedActions: [{ label: "Square control", link: "/square.html" }],
          requiresApproval: true,
          safeToAutoExecute: false,
        };
      }
    }

    return {
      ok: true,
      commandType: "SQUARE_APPROVAL_REQUIRED",
      squareCommand: sqClass,
      answer:
        "That Square action needs human approval. Use Square Control: create a local draft, approve it, then create a Square draft — Cheeky OS will not auto-send or auto-charge.",
      proposedActions: [
        { label: "Square control", link: "/square.html", reason: sqClass.reason || "approval" },
      ],
      requiresApproval: true,
      safeToAutoExecute: false,
    };
  }

  const classification = classifyAICommand(commandStr);
  const proposedActions = [];

  if (classification.category === "BLOCKED") {
    return {
      ok: true,
      commandType: "BLOCKED",
      answer:
        "That request is blocked by Cheeky OS safety policy (deposits, payments/webhooks, garment auto-ordering, or destructive actions). Use Owner and Comms workflows with human approval.",
      proposedActions: [],
      requiresApproval: true,
      safeToAutoExecute: false,
    };
  }

  if (classification.category === "READ_ONLY") {
    const base = readOnlyAnswerFromContext(ctx, commandStr);
    const ai = await runOpenAiCommand(commandStr, classification, ctx, enrichment);
    let answer = base;
    let proposed = [];
    if (ai.ok && ai.data && typeof ai.data.answer === "string" && ai.data.answer.trim()) {
      answer = ai.data.answer.trim();
    }
    if (ai.ok && ai.data && Array.isArray(ai.data.proposedActions)) {
      proposed = ai.data.proposedActions
        .filter((x) => x && typeof x === "object")
        .map((x) => ({
          label: String(x.label || "").slice(0, 200),
          link: String(x.link || "").slice(0, 500),
          reason: String(x.reason || "").slice(0, 400),
        }))
        .slice(0, 5);
    }
    return {
      ok: true,
      commandType: "READ_ONLY",
      answer,
      proposedActions: proposed,
      requiresApproval: false,
      safeToAutoExecute: true,
    };
  }

  const ai = await runOpenAiCommand(commandStr, classification, ctx, enrichment);
  let answer =
    classification.category === "DRAFT_ONLY"
      ? "Draft guidance (not sent): review in Comms / Sales before any outbound action."
      : "Proposal only — confirm in production or Comms before executing.";
  let proposed = [];

  if (ai.ok && ai.data) {
    if (typeof ai.data.answer === "string" && ai.data.answer.trim()) answer = ai.data.answer.trim();
    if (Array.isArray(ai.data.proposedActions)) {
      proposed = ai.data.proposedActions
        .filter((x) => x && typeof x === "object")
        .map((x) => ({
          label: String(x.label || "").slice(0, 200),
          link: String(x.link || "").slice(0, 500),
          reason: String(x.reason || "").slice(0, 400),
        }))
        .slice(0, 5);
    }
  } else {
    answer +=
      " AI drafting unavailable — use /comms.html and /sales.html. Context snapshot: " +
      readOnlyAnswerFromContext(ctx, commandStr).slice(0, 500);
  }

  return {
    ok: true,
    commandType: classification.category,
    answer,
    proposedActions: proposed,
    requiresApproval: true,
    safeToAutoExecute: false,
  };
}

module.exports = {
  classifyAICommand,
  buildAIOperatorContext,
  gatherPromptEnrichment,
  getOperatorBrief,
  runOperatorCommand,
  buildDeterministicBrief,
};
