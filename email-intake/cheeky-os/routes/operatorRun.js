/**
 * POST /api/operator/run — natural-language operator (OpenAI + simple keyword tools + Square).
 */

const path = require("path");
const express = require("express");
const { fetchSafe } = require("../utils/fetchSafe");
const { initializeSquareIntegration } = require("../integrations/square");
const squareService = require(path.join(
  __dirname,
  "..",
  "..",
  "src",
  "services",
  "squareService.js"
));
const { getProductionQueue } = require("../services/orderStatusEngine");

const memoryService = require(path.join(
  __dirname,
  "..",
  "..",
  "src",
  "services",
  "memoryService.js"
));

const autopilotService = require(path.join(
  __dirname,
  "..",
  "..",
  "src",
  "services",
  "autopilotService.js"
));
const squareReportingService = require(path.join(
  __dirname,
  "..",
  "..",
  "src",
  "services",
  "squareReportingService.js"
));
const salesEngine = require(path.join(
  __dirname,
  "..",
  "..",
  "src",
  "services",
  "salesEngine.js"
));
const squareOperator = require(path.join(
  __dirname,
  "..",
  "..",
  "src",
  "services",
  "squareOperator.js"
));
const googleAdsSafe = require(path.join(
  __dirname,
  "..",
  "..",
  "src",
  "services",
  "googleAds.js"
));
const artRouterCompat = require(path.join(
  __dirname,
  "..",
  "..",
  "src",
  "services",
  "artRouter.js"
));
const commandRouter = require(path.join(
  __dirname,
  "..",
  "..",
  "src",
  "services",
  "commandRouter.js"
));
const reportingService = require(path.join(
  __dirname,
  "..",
  "..",
  "src",
  "services",
  "reporting.js"
));
const memoryCompat = require(path.join(
  __dirname,
  "..",
  "..",
  "src",
  "services",
  "memory.js"
));
const skillEngine = require(path.join(
  __dirname,
  "..",
  "..",
  "src",
  "services",
  "skillEngine.js"
));

const router = express.Router();

const SYSTEM_PROMPT = `You are a print shop operator. Interpret commands and choose actions.

Respond with ONLY valid JSON (no markdown, no code fences):
{"customerName":"","quantity":1,"itemName":"Custom item","unitPrice":25}

Use the user message to fill fields. quantity must be at least 1. unitPrice is USD per item.`;

const CONTEXT_PROMPT_MAX_CHARS = 11000;

/**
 * GET /api/ai/context (same process). Fails soft — caller continues without context.
 * @returns {Promise<object|null>}
 */
async function fetchSystemContext() {
  const port = Number(process.env.PORT || process.env.CHEEKY_OS_PORT || 3000);
  const url = `http://127.0.0.1:${port}/api/ai/context`;
  const signal =
    typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function"
      ? AbortSignal.timeout(12000)
      : undefined;
  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "cheeky-operator-context/1",
    },
    signal,
  });
  if (!res.ok) {
    throw new Error(`context ${res.status}`);
  }
  return res.json();
}

/**
 * Compact context for prompts — summary, alerts, capped lists (token-safe).
 * @param {object | null} ctx
 * @returns {string}
 */
function buildOperatorContextBlob(ctx) {
  if (!ctx || ctx.success !== true) {
    return "{}";
  }
  const clip = (arr, n) => (Array.isArray(arr) ? arr.slice(0, n) : []);
  const out = {
    summary: ctx.summary || {},
    alerts: clip(ctx.alerts, 12),
    depositFollowups: clip(ctx.depositFollowups, 8),
    productionQueue: clip(ctx.productionQueue, 10),
    garmentOrders: clip(ctx.garmentOrders, 8),
    proofs: clip(ctx.proofs, 8),
    readyForPickup: clip(ctx.readyForPickup, 8),
    recentOrders: clip(ctx.recentOrders, 8),
  };
  let s = JSON.stringify(out);
  if (s.length <= CONTEXT_PROMPT_MAX_CHARS) {
    return s;
  }
  const minimal = {
    summary: out.summary,
    alerts: clip(ctx.alerts, 8),
    depositFollowups: clip(ctx.depositFollowups, 4),
    productionQueue: clip(ctx.productionQueue, 5),
    garmentOrders: clip(ctx.garmentOrders, 4),
    proofs: clip(ctx.proofs, 4),
    readyForPickup: clip(ctx.readyForPickup, 4),
    note: "lists_truncated_for_token_limit",
  };
  return JSON.stringify(minimal);
}

function buildExtractSystemPrompt(systemContext) {
  const blob = buildOperatorContextBlob(systemContext);
  const skill = String(
    (systemContext && systemContext.__skill) || ""
  ).trim();
  const skillLine = skill
    ? `\nYou are using the ${skill} framework. Apply its structure.\n`
    : "";
  if (blob === "{}" || blob.length < 4) {
    return `${SYSTEM_PROMPT}${skillLine}`;
  }
  return `You are an intelligent operator for a print shop.
You have access to real-time system state.
${skillLine}

Use the following context to make decisions:

${blob}

Then process the user command for entity extraction only.

${SYSTEM_PROMPT}`;
}

/**
 * Natural-language answers when keyword routing does not apply (e.g. "what needs attention?").
 * @param {string} message
 * @param {object | null} systemContext
 * @returns {Promise<{ ok: boolean, data: { action: string, reasoning: string, priority: string, message: string } | null }>}
 */
async function runOperatorWithContext(message, systemContext, skill) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return { ok: false, data: null };
  }
  const blob = buildOperatorContextBlob(systemContext);
  const skillLine = skill
    ? `\nYou are using the ${skill} framework. Apply its structure.\n`
    : "";
  const systemContent = `You are an intelligent operator for a print shop.
You have access to real-time system state.
${skillLine}

Use the following context to make decisions:

${blob}

Then process the user command.

Rules:
- Prioritize tasks using summary and alerts; mention the highest-impact items first when asked what needs attention.
- For print / production questions, cross-check deposits (unpaid), proofs (unapproved / not sent), and art readiness using the lists; do not recommend printing unpaid or blocked jobs without stating blockers.
- If the context is empty or missing fields, say what is unknown.

Respond with ONLY valid JSON (no markdown, no code fences):
{"action":"short_label","reasoning":"brief reasoning","priority":"high|medium|low","message":"clear answer for staff"}`;

  const result = await fetchSafe("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemContent },
        { role: "user", content: message },
      ],
      temperature: 0.35,
      max_tokens: 700,
    }),
  });

  if (!result.ok) {
    return { ok: false, data: null };
  }
  try {
    const raw = result.data.choices[0].message.content.trim();
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : raw);
    return {
      ok: true,
      data: {
        action: String(parsed.action || "advise").trim() || "advise",
        reasoning: String(parsed.reasoning || "").trim(),
        priority: ["high", "medium", "low"].includes(
          String(parsed.priority || "").toLowerCase()
        )
          ? String(parsed.priority).toLowerCase()
          : "medium",
        message: String(parsed.message || "").trim(),
      },
    };
  } catch {
    return { ok: false, data: null };
  }
}

async function runSkillAwareResponse(message, skill) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return {
      success: true,
      action: "skill_response_returned",
      result: {
        skill,
        text: `Skill selected: ${skill}. OPENAI_API_KEY is not set, returning deterministic placeholder output.`,
      },
    };
  }
  const result = await fetchSafe("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are using the ${skill} framework. Apply its structure.`,
        },
        { role: "user", content: message },
      ],
      temperature: 0.35,
      max_tokens: 500,
    }),
  });
  if (!result.ok) {
    return {
      success: false,
      action: "skill_response_failed",
      error: result.error || "OpenAI request failed",
    };
  }
  const text =
    result.data &&
    result.data.choices &&
    result.data.choices[0] &&
    result.data.choices[0].message
      ? String(result.data.choices[0].message.content || "").trim()
      : "";
  return {
    success: true,
    action: "skill_response_returned",
    result: { skill, text },
  };
}

function naiveExtract(message) {
  const m = String(message);
  let quantity = 1;
  const qMatch =
    m.match(/\b(\d+)\s*(?:shirt|shirts|hoodie|hoodies|tee|tees|pcs|pieces)\b/i) ||
    m.match(/\b(\d+)\b/);
  if (qMatch) quantity = Math.max(1, parseInt(qMatch[1], 10));

  let customerName = "";
  const forMatch =
    m.match(/\bfor\s+([^.,;]+?)(?:\s*$|,|\.|;)/i) ||
    m.match(/\bfor\s+([A-Za-z][A-Za-z\s'-]+)/i);
  if (forMatch) customerName = String(forMatch[1] || "").trim();

  let itemName = "Custom item";
  const itemMatch = m.match(/\d+\s+([a-z]+)\s+for/i);
  if (itemMatch) itemName = itemMatch[1];

  return {
    customerName,
    quantity,
    itemName,
    unitPrice: 25,
  };
}

/**
 * @param {string} message
 * @param {object | null} [systemContext] from GET /api/ai/context (optional)
 * @returns {Promise<{ customerName: string, quantity: number, itemName: string, unitPrice: number }>}
 */
async function extractEntities(message, systemContext) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return naiveExtract(message);

  const systemPrompt = buildExtractSystemPrompt(systemContext);

  const result = await fetchSafe("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: message },
      ],
      temperature: 0.2,
      max_tokens: 200,
    }),
  });

  if (!result.ok) return naiveExtract(message);

  try {
    const raw = result.data.choices[0].message.content.trim();
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : raw);
    return {
      customerName: String(parsed.customerName || "").trim(),
      quantity: Math.max(1, Math.floor(Number(parsed.quantity) || 1)),
      itemName: String(parsed.itemName || "Custom item").trim() || "Custom item",
      unitPrice:
        Number.isFinite(Number(parsed.unitPrice)) && Number(parsed.unitPrice) > 0
          ? Number(parsed.unitPrice)
          : 25,
    };
  } catch {
    return naiveExtract(message);
  }
}

/**
 * @param {string} hint
 * @param {Array<object>} customers
 * @returns {string | null}
 */
function matchSquareCustomerId(hint, customers) {
  const h = String(hint || "")
    .toLowerCase()
    .trim();
  if (!h) return null;
  for (const c of customers) {
    const display =
      [c.given_name, c.family_name].filter(Boolean).join(" ").trim() ||
      c.company_name ||
      "";
    const d = display.toLowerCase();
    const gn = String(c.given_name || "").toLowerCase();
    if (!d && !gn) continue;
    if (
      (d && (d.includes(h) || h.includes(d.split(/\s+/)[0]))) ||
      (gn && (gn.includes(h) || h.includes(gn)))
    ) {
      return c.id;
    }
  }
  return null;
}

function loadArtRouting() {
  try {
    return require(path.join(
      __dirname,
      "..",
      "..",
      "dist",
      "services",
      "artRoutingService.js"
    ));
  } catch {
    return null;
  }
}

function loadProofRouting() {
  try {
    return require(path.join(
      __dirname,
      "..",
      "..",
      "dist",
      "services",
      "proofRoutingService.js"
    ));
  } catch {
    return null;
  }
}

function loadCustomerComms() {
  try {
    return require(path.join(
      __dirname,
      "..",
      "..",
      "dist",
      "services",
      "customerCommsService.js"
    ));
  } catch {
    return null;
  }
}

function loadCustomerReplyService() {
  try {
    return require(path.join(
      __dirname,
      "..",
      "..",
      "dist",
      "services",
      "customerReplyService.js"
    ));
  } catch {
    return null;
  }
}

function loadWorkOrderService() {
  try {
    return require(path.join(
      __dirname,
      "..",
      "..",
      "dist",
      "services",
      "workOrderService.js"
    ));
  } catch {
    return null;
  }
}

function loadQuoteEngine() {
  try {
    return require(path.join(
      __dirname,
      "..",
      "..",
      "dist",
      "services",
      "quoteEngine.js"
    ));
  } catch {
    return null;
  }
}

/** UUID or numeric / order # fragment (best-effort). */
function extractOrderIdFromMessage(message) {
  const s = String(message || "");
  const uuid = s.match(
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i
  );
  if (uuid) return uuid[0].trim();
  const forOrder = s.match(/\bfor\s+order\s+([a-zA-Z0-9#.-]+)/i);
  if (forOrder) return forOrder[1].replace(/^#/, "").trim();
  const tagged = s.match(/\border\s+#?\s*([a-zA-Z0-9CHK.-]+)/i);
  if (tagged) return tagged[1].trim();
  const hash = s.match(/#([0-9a-f-]{8,})/i);
  if (hash) return hash[1].trim();
  return "";
}

function reportIntentFromMessage(message) {
  const low = String(message || "").toLowerCase();
  if (
    low.includes("top customers") ||
    low.includes("best customers") ||
    low.includes("biggest customers")
  ) {
    return "GET_TOP_CUSTOMERS_REPORT";
  }
  if (
    low.includes("outstanding") ||
    low.includes("unpaid invoices") ||
    low.includes("money owed") ||
    low.includes("who owes us money")
  ) {
    return "GET_OUTSTANDING_INVOICES_REPORT";
  }
  if (
    low.includes("business summary") ||
    low.includes("report summary") ||
    low === "summary" ||
    low.includes("give me a business summary")
  ) {
    return "GET_AI_BUSINESS_SUMMARY";
  }
  if (
    low.includes("this week") ||
    low.includes("weekly") ||
    low.includes("made this week")
  ) {
    return "GET_WEEKLY_SALES_REPORT";
  }
  if (
    low.includes("today") ||
    low.includes("daily") ||
    low.includes("made today") ||
    low.includes("how much did we make today")
  ) {
    return "GET_DAILY_SALES_REPORT";
  }
  return null;
}

function usd(n) {
  return `$${(Math.round((Number(n) || 0) * 100) / 100).toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
}

async function runReportIntent(intent) {
  if (intent === "GET_DAILY_SALES_REPORT") {
    const data = await squareReportingService.getDailySales();
    const totalRevenue = Number(data.totalRevenue) || 0;
    const totalOrders = Number(data.totalOrders) || 0;
    const avgOrderValue = Number(data.avgOrderValue) || 0;
    return {
      success: true,
      intent,
      action: "daily_sales_report_returned",
      result: { totalRevenue, totalOrders, avgOrderValue },
      spokenSummary:
        totalOrders > 0
          ? `Today you made ${usd(totalRevenue)} across ${totalOrders} order${totalOrders === 1 ? "" : "s"}. Average order value is ${usd(avgOrderValue)}.`
          : "No sales data found for today yet.",
    };
  }

  if (intent === "GET_WEEKLY_SALES_REPORT") {
    const [trend, orders] = await Promise.all([
      squareReportingService.getWeeklySales(),
      squareReportingService.getOrders({
        start: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
        end: new Date(),
      }),
    ]);
    const totalRevenue = (trend || []).reduce((sum, d) => sum + (Number(d.revenue) || 0), 0);
    const totalOrders = Array.isArray(orders) ? orders.length : 0;
    const avgOrderValue = totalOrders ? totalRevenue / totalOrders : 0;
    return {
      success: true,
      intent,
      action: "weekly_sales_report_returned",
      result: {
        totalRevenue: Math.round(totalRevenue * 100) / 100,
        totalOrders,
        avgOrderValue: Math.round(avgOrderValue * 100) / 100,
        trend: Array.isArray(trend) ? trend : [],
      },
      spokenSummary:
        totalOrders > 0
          ? `This week you made ${usd(totalRevenue)} across ${totalOrders} orders. Average order value was ${usd(avgOrderValue)}.`
          : "No sales data found for this week yet.",
    };
  }

  if (intent === "GET_TOP_CUSTOMERS_REPORT") {
    const top = await squareReportingService.getTopCustomers();
    const customers = Array.isArray(top) ? top : [];
    const first = customers[0];
    const second = customers[1];
    return {
      success: true,
      intent,
      action: "top_customers_report_returned",
      result: { customers },
      spokenSummary:
        customers.length === 0
          ? "No customer spend data found yet."
          : `Your top customer is ${first.customer || first.customerId}, followed by ${second ? second.customer || second.customerId : "nobody else yet"}.`,
    };
  }

  if (intent === "GET_OUTSTANDING_INVOICES_REPORT") {
    const out = await squareReportingService.getOutstandingInvoices();
    const unpaid = Array.isArray(out.unpaidInvoices) ? out.unpaidInvoices : [];
    const totalOutstanding = Number(out.totalOutstandingAmount) || 0;
    return {
      success: true,
      intent,
      action: "outstanding_invoices_report_returned",
      result: {
        count: unpaid.length,
        totalOutstanding: Math.round(totalOutstanding * 100) / 100,
        invoices: unpaid,
      },
      spokenSummary:
        unpaid.length > 0
          ? `You have ${unpaid.length} outstanding invoice${unpaid.length === 1 ? "" : "s"} totaling ${usd(totalOutstanding)}.`
          : "You currently have no outstanding invoices.",
    };
  }

  if (intent === "GET_AI_BUSINESS_SUMMARY") {
    const out = await squareReportingService.getAiSummary();
    return {
      success: true,
      intent,
      action: "ai_business_summary_returned",
      result: out.data || {},
      insights: String(out.insights || ""),
      spokenSummary: String(out.insights || "Business summary unavailable."),
    };
  }

  return null;
}

async function handleOperatorRunRequest(req, res) {
  const message = String((req.body && req.body.message) || "").trim();
  const skill = String((req.body && req.body.skill) || "")
    .trim()
    .toLowerCase();
  if (!message) {
    return res.status(400).json({
      success: false,
      message: "message is required",
    });
  }

  let systemContext = null;
  try {
    systemContext = await fetchSystemContext();
  } catch (err) {
    console.warn(
      "[operator/run] system context skipped:",
      err instanceof Error ? err.message : err
    );
  }
  if (systemContext && skill) {
    systemContext.__skill = skill;
  }

  const low = message.toLowerCase();

  const routedCommand = commandRouter.routeCommand(message);
  if (routedCommand.matched) {
    try {
      const out = await commandRouter.executeRoutedCommand(routedCommand);
      return res.json({
        success: !!out.ok,
        command: routedCommand.normalized,
        action: routedCommand.action,
        result: out,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return res.status(500).json({
        success: false,
        command: routedCommand.normalized,
        action: routedCommand.action,
        result: { ok: false, message: msg },
      });
    }
  }

  if (
    /\bshow\s+autopilot\s+plan\b/i.test(message) ||
    /^\s*autopilot\s+plan\s*$/i.test(message) ||
    /\bwhat\s+should\s+the\s+system\s+do\s+next/i.test(message) ||
    /\bwhat\s+can\s+be\s+automated\b/i.test(low)
  ) {
    try {
      const { items } = await autopilotService.getAutopilotPlan();
      return res.json({
        success: true,
        action: "autopilot_plan",
        details: { count: items.length, items },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return res.status(500).json({ success: false, message: msg });
    }
  }

  if (/\brun\s+safe\s+autopilot\b/i.test(low)) {
    try {
      const out = await autopilotService.runAutopilotExecution({ mode: "safe" });
      return res.json({
        success: true,
        action: "autopilot_safe_run",
        details: out,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return res.status(500).json({ success: false, message: msg });
    }
  }

  if (/\bcustomer\s+history\b/i.test(low)) {
    try {
      const hint = message.replace(/customer\s+history/i, "").trim();
      const rows = await squareOperator.getCustomerOrders(hint);
      return res.json({
        success: true,
        action: "customer_history",
        result: { customer: hint || "", orders: rows },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return res.status(500).json({ success: false, message: msg });
    }
  }

  if (/\boutstanding\s+invoices?\b/i.test(low)) {
    try {
      const out = await squareOperator.getOutstandingInvoices();
      return res.json({
        success: true,
        action: "outstanding_invoices",
        result: out,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return res.status(500).json({ success: false, message: msg });
    }
  }

  if (/\b(daily\s+report|today\s+report)\b/i.test(low)) {
    try {
      const data = await reportingService.dailySummary();
      return res.json({
        success: true,
        action: "daily_report_returned",
        result: data,
        spokenSummary: `Today you have ${data.ordersCreatedToday || 0} orders and $${Number(data.revenueToday || 0).toFixed(2)} in revenue.`,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return res.status(500).json({ success: false, error: msg });
    }
  }

  if (/\b(weekly\s+report|week\s+report)\b/i.test(low)) {
    try {
      const data = await reportingService.weeklySummary();
      return res.json({
        success: true,
        action: "weekly_report_returned",
        result: data,
        spokenSummary: `This week you have ${data.ordersThisWeek || 0} orders and $${Number(data.revenueThisWeek || 0).toFixed(2)} in revenue.`,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return res.status(500).json({ success: false, error: msg });
    }
  }

  if (/\bcustomer\s+report\b/i.test(low)) {
    try {
      const emailMatch = message.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
      const email = emailMatch ? emailMatch[0] : "";
      if (!email) {
        return res.status(400).json({
          success: false,
          error: "Include customer email for customer report",
        });
      }
      const data = await reportingService.customerReport(email);
      return res.json({
        success: true,
        action: "customer_report_returned",
        result: data,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return res.status(500).json({ success: false, error: msg });
    }
  }

  if (/\bads?\s+report\b/i.test(low)) {
    const data = googleAdsSafe.getCampaignReport();
    return res.json({
      success: true,
      action: "ads_report",
      result: data,
    });
  }

  if (/\bart\s+route\b/i.test(low) || /\broute\s+to\s+peter\b/i.test(low)) {
    const orderId = extractOrderIdFromMessage(message);
    const route = artRouterCompat.routeToPeter({ orderId });
    return res.json({
      success: true,
      action: "art_route",
      result: route,
    });
  }

  if (
    /\bwho\s+should\s+i\s+call\s+today\b/i.test(low) ||
    /\bcall\s+list\b/i.test(low) ||
    /\bshow\s+sales\s+leads\b/i.test(low) ||
    /\bbest\s+customers\s+to\s+contact\b/i.test(low)
  ) {
    try {
      const leads = await salesEngine.getDailyCallList(5);
      return res.json({
        success: true,
        action: "daily_call_list_returned",
        result: { count: leads.length, leads },
        spokenSummary:
          leads.length > 0
            ? `Top call target is ${leads[0].name} with score ${leads[0].score}.`
            : "No call targets found today.",
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return res.status(500).json({ success: false, message: msg });
    }
  }

  if (/\bmemory\s+insights\b/i.test(low)) {
    try {
      const categoryMatch = message.match(/category\s*[:=]\s*([a-z0-9_-]+)/i);
      const category = categoryMatch ? categoryMatch[1] : "";
      const result = memoryCompat.getInsights(category);
      return res.json({
        success: true,
        action: "memory_insights_returned",
        result,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return res.status(500).json({ success: false, error: msg });
    }
  }

  if (/\bkaizen\b/i.test(low)) {
    try {
      const summary = await memoryCompat.generateKaizenSummary();
      return res.json({
        success: true,
        action: "kaizen_summary_returned",
        result: { summary },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return res.status(500).json({ success: false, error: msg });
    }
  }

  if (
    /\bwrite\s+follow-up\b/i.test(low) ||
    /\bsummarize\s+report\b/i.test(low) ||
    /\bplan\s+my\s+day\b/i.test(low)
  ) {
    try {
      const skill = skillEngine.selectSkill(message) || "workflow";
      const out = await runSkillAwareResponse(message, skill);
      if (!out.success) return res.status(500).json(out);
      return res.json(out);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return res.status(500).json({ success: false, error: msg });
    }
  }

  const reportIntent = reportIntentFromMessage(message);
  if (reportIntent) {
    try {
      try {
        memoryService.logEvent("report_requested", { intent: reportIntent, message });
        if (reportIntent === "GET_AI_BUSINESS_SUMMARY") {
          memoryService.logEvent("ai_business_summary_requested", { message });
        }
        if (reportIntent === "GET_OUTSTANDING_INVOICES_REPORT") {
          memoryService.logEvent("outstanding_report_requested", { message });
        }
      } catch (_) {
        /* optional */
      }
      const out = await runReportIntent(reportIntent);
      if (!out) {
        return res.status(500).json({
          success: false,
          intent: reportIntent,
          action: "report_failed",
          error: "Unsupported report intent",
        });
      }
      return res.json(out);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[operator/report]", reportIntent, msg);
      try {
        memoryService.logEvent("square_error", {
          step: "operator_report",
          intent: reportIntent,
          message: msg,
        });
      } catch (_) {}
      return res.status(500).json({
        success: false,
        intent: reportIntent,
        action: "report_failed",
        error: msg,
      });
    }
  }

  const proof = loadProofRouting();
  const art = loadArtRouting();

  if (
    proof &&
    (low.includes("need proof") ||
      low.includes("orders need proof") ||
      low.includes("what orders need proof"))
  ) {
    try {
      const orders =
        typeof proof.listOrdersProofQueue === "function"
          ? await proof.listOrdersProofQueue()
          : [];
      return res.json({
        success: true,
        action: "orders_needing_proof",
        details: { orders },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return res.status(500).json({ success: false, message: msg });
    }
  }

  if (proof && /\bsend\s+proof\b/i.test(message)) {
    const orderId = extractOrderIdFromMessage(message);
    if (!orderId) {
      return res.json({
        success: false,
        message: "Include order id (UUID or order #)",
      });
    }
    try {
      const out = await proof.sendProofForOrder(orderId);
      return res.json({
        success: true,
        action: "send_proof",
        details: out,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return res.status(500).json({ success: false, message: msg });
    }
  }

  if (
    proof &&
    (/\bproof\s+approved\b/i.test(message) ||
      /\bmark\s+proof\s+approved\b/i.test(message))
  ) {
    const orderId = extractOrderIdFromMessage(message);
    if (!orderId) {
      return res.json({
        success: false,
        message: "Include order id (UUID or order #)",
      });
    }
    try {
      await proof.approveProof(orderId);
      return res.json({
        success: true,
        action: "mark_proof_approved",
        details: { orderId },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return res.status(500).json({ success: false, message: msg });
    }
  }

  if (
    art &&
    (low.includes("need art") ||
      low.includes("orders need art") ||
      low.includes("what orders need art"))
  ) {
    try {
      const orders =
        typeof art.listOrdersNeedingArt === "function"
          ? await art.listOrdersNeedingArt()
          : [];
      return res.json({
        success: true,
        action: "orders_needing_art",
        details: { orders },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return res.status(500).json({ success: false, message: msg });
    }
  }

  if (art && (low.includes("digitizer") || /\bto\s+peter\b/i.test(message))) {
    const orderId = extractOrderIdFromMessage(message);
    if (!orderId) {
      return res.json({
        success: false,
        message: "Include order id (UUID or order #)",
      });
    }
    try {
      const out = await art.sendOrderToDigitizer(orderId);
      return res.json({
        success: true,
        action: "send_to_digitizer",
        details: out,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return res.status(500).json({ success: false, message: msg });
    }
  }

  if (
    art &&
    (low.includes("mark art ready") || /\bart ready\b/i.test(message))
  ) {
    const orderId = extractOrderIdFromMessage(message);
    if (!orderId) {
      return res.json({
        success: false,
        message: "Include order id (UUID or order #)",
      });
    }
    try {
      await art.markArtReady(orderId);
      return res.json({
        success: true,
        action: "mark_art_ready",
        details: { orderId },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return res.status(500).json({ success: false, message: msg });
    }
  }

  const comms = loadCustomerComms();
  const replySvc = loadCustomerReplyService();
  const woSvc = loadWorkOrderService();
  const quoteEng = loadQuoteEngine();

  if (
    comms &&
    (low.includes("what orders need communication") ||
      low.includes("orders need communication") ||
      low.includes("need communication"))
  ) {
    try {
      const [depositCandidates, digest] = await Promise.all([
        typeof comms.getOrdersNeedingDepositReminder === "function"
          ? comms.getOrdersNeedingDepositReminder()
          : [],
        typeof comms.getCustomerCommsDigest === "function"
          ? comms.getCustomerCommsDigest()
          : { counts: {}, summaryLine: "" },
      ]);
      return res.json({
        success: true,
        action: "orders_needing_communication",
        details: {
          depositReminderCandidates: depositCandidates,
          digestSummary: digest.summaryLine,
          digestCounts: digest.counts,
        },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return res.status(500).json({ success: false, message: msg });
    }
  }

  if (
    comms &&
    (low.includes("recent customer communications") ||
      low.includes("show recent communications") ||
      low.includes("recent communications"))
  ) {
    try {
      const entries =
        typeof comms.listRecentCommunications === "function"
          ? await comms.listRecentCommunications(40)
          : [];
      return res.json({
        success: true,
        action: "recent_customer_communications",
        details: { entries },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return res.status(500).json({ success: false, message: msg });
    }
  }

  if (
    replySvc &&
    (/\b(show|list)\s+(recent\s+)?customer\s+replies?\b/i.test(message) ||
      (low.includes("customer replies") &&
        (low.includes("show") || low.includes("list") || low.includes("recent"))))
  ) {
    try {
      const replies =
        typeof replySvc.listRecentInboundReplies === "function"
          ? await replySvc.listRecentInboundReplies(50)
          : [];
      return res.json({
        success: true,
        action: "customer_replies",
        details: { replies },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return res.status(500).json({ success: false, message: msg });
    }
  }

  if (replySvc && /\bwhat\s+proofs?\s+were\s+approved\b/i.test(message)) {
    try {
      const rows =
        typeof replySvc.listRecentInboundReplies === "function"
          ? await replySvc.listRecentInboundReplies(80)
          : [];
      const proofsApproved = rows.filter(
        (r) =>
          r.type === "CUSTOMER_APPROVED" ||
          r.classification === "PROOF_APPROVED"
      );
      return res.json({
        success: true,
        action: "proofs_approved_by_customer",
        details: { replies: proofsApproved },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return res.status(500).json({ success: false, message: msg });
    }
  }

  if (replySvc && /\bwhat\s+revisions?\s+were\s+requested\b/i.test(message)) {
    try {
      const rows =
        typeof replySvc.listRecentInboundReplies === "function"
          ? await replySvc.listRecentInboundReplies(80)
          : [];
      const revs = rows.filter(
        (r) =>
          r.type === "CUSTOMER_REVISION_REQUEST" ||
          r.classification === "REVISION_REQUEST"
      );
      return res.json({
        success: true,
        action: "revision_requests_from_customers",
        details: { replies: revs },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return res.status(500).json({ success: false, message: msg });
    }
  }

  if (
    replySvc &&
    (/\bunmatched\s+customer\s+replies?\b/i.test(message) ||
      /\bshow\s+unmatched\s+replies?\b/i.test(message))
  ) {
    try {
      const rows =
        typeof replySvc.listRecentInboundReplies === "function"
          ? await replySvc.listRecentInboundReplies(80)
          : [];
      const unmatched = rows.filter((r) => r.orderId == null);
      return res.json({
        success: true,
        action: "unmatched_customer_replies",
        details: { replies: unmatched },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return res.status(500).json({ success: false, message: msg });
    }
  }

  if (
    woSvc &&
    (/\bgenerate\s+work\s+order\b/i.test(message) ||
      /\bwork\s+order\s+for\s+(?:order\s+)?/i.test(message))
  ) {
    const orderId = extractOrderIdFromMessage(message);
    if (!orderId) {
      return res.json({
        success: false,
        message: "Include order id (UUID or order #)",
      });
    }
    try {
      const out = await woSvc.generateWorkOrder(orderId);
      if (!out.ok) {
        try {
          memoryService.logEvent("work_order_blocked", {
            orderId,
            blockers: out.blockers,
          });
        } catch (_) {}
        return res.json({
          success: false,
          message: "Work order not ready",
          blockers: out.blockers,
          action: "work_order_blocked",
        });
      }
      try {
        memoryService.logEvent("work_order_generated", {
          orderId,
          workOrderNumber: out.workOrderNumber,
        });
      } catch (_) {}
      return res.json({
        success: true,
        action: "work_order_generated",
        orderId,
        workOrderNumber: out.workOrderNumber,
        workOrder: out.packet,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return res.status(500).json({ success: false, message: msg });
    }
  }

  if (
    woSvc &&
    (/\bwork\s+orders?\s+ready\b/i.test(message) ||
      /\bshow\s+work\s+orders?\s+ready\b/i.test(message))
  ) {
    try {
      const items =
        typeof woSvc.listWorkOrdersReady === "function"
          ? await woSvc.listWorkOrdersReady(100)
          : [];
      return res.json({
        success: true,
        action: "work_orders_ready",
        details: { items },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return res.status(500).json({ success: false, message: msg });
    }
  }

  if (
    woSvc &&
    (/\bwhy\s+can'?t\b.*\bwork\s+order\b/i.test(message) ||
      /\bwhy\s+.*\bgenerate\b.*\bwork\s+order\b/i.test(message))
  ) {
    const orderId = extractOrderIdFromMessage(message);
    if (!orderId) {
      return res.json({
        success: false,
        message: "Include order id (UUID or order #)",
      });
    }
    try {
      const order =
        typeof woSvc.loadOrderForWorkOrder === "function"
          ? await woSvc.loadOrderForWorkOrder(orderId)
          : null;
      if (!order) {
        return res.json({ success: false, message: "Order not found" });
      }
      const gate =
        typeof woSvc.isWorkOrderReady === "function"
          ? woSvc.isWorkOrderReady(order)
          : { ready: false, blockers: [] };
      return res.json({
        success: true,
        action: "work_order_gate",
        details: { orderId, ...gate },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return res.status(500).json({ success: false, message: msg });
    }
  }

  if (woSvc && /\bopen\s+work\s+order\b/i.test(message)) {
    const orderId = extractOrderIdFromMessage(message);
    if (!orderId) {
      return res.json({
        success: false,
        message: "Include order id (UUID or order #)",
      });
    }
    return res.json({
      success: true,
      action: "work_order_links",
      details: {
        printUrl: `/work-orders/${orderId}/print`,
        apiUrl: `/api/work-orders/${orderId}`,
      },
    });
  }

  if (
    quoteEng &&
    (/\bquote\b|\bestimate\b|\bmargin on\b|\bcalculate quote\b|\btoo low\b|\bunderpriced\b/i.test(
      message
    ))
  ) {
    const loose =
      typeof quoteEng.parseLooseQuoteFromText === "function"
        ? quoteEng.parseLooseQuoteFromText(message)
        : null;
    if (loose && quoteEng.validateQuoteInput(loose).ok) {
      try {
        const quote = quoteEng.calculateQuote(loose);
        const squarePrep =
          typeof quoteEng.buildSquareDraftFromQuote === "function"
            ? quoteEng.buildSquareDraftFromQuote(quote, loose)
            : null;
        try {
          memoryService.logEvent("quote_calculated", {
            source: "operator",
            riskLevel: quote.riskLevel,
            recommendedPrice: quote.recommendedPrice,
          });
          if (quote.warnings && quote.warnings.length) {
            memoryService.logEvent("quote_warning_triggered", {
              warnings: quote.warnings,
            });
          }
          if (quote.riskLevel === "DANGER" || quote.estimatedMarginPercent < 30) {
            memoryService.logEvent("low_margin_quote_detected", {
              marginPercent: quote.estimatedMarginPercent,
            });
          }
        } catch (_) {}
        return res.json({
          success: true,
          action: "quote_calculated",
          details: { quote, squarePrep },
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return res.json({ success: false, message: msg });
      }
    }
    return res.json({
      success: true,
      action: "quote_margin_help",
      details: {
        message:
          "Margin bands: SAFE ≥45%, WARNING 30–45%, DANGER <30%. Example: Quote 24 shirts at $3.50 blanks using DTF",
        example:
          "Estimate margin on 50 hoodies screen print — or add: rush art for fees",
      },
    });
  }

  if (comms && /\bsend\s+deposit\s+reminder\b/i.test(message)) {
    const orderId = extractOrderIdFromMessage(message);
    if (!orderId) {
      return res.json({
        success: false,
        message: "Include order id (UUID or order #)",
      });
    }
    try {
      const out = await comms.sendDepositReminder(orderId);
      return res.json({
        success: true,
        action: "send_deposit_reminder",
        details: out,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return res.status(500).json({ success: false, message: msg });
    }
  }

  if (
    comms &&
    (/\bsend\s+proof\s+request\b/i.test(message) ||
      (low.includes("proof request") && extractOrderIdFromMessage(message)))
  ) {
    const orderId = extractOrderIdFromMessage(message);
    if (!orderId) {
      return res.json({
        success: false,
        message: "Include order id (UUID or order #)",
      });
    }
    try {
      const out =
        typeof comms.sendProofRequestComm === "function"
          ? await comms.sendProofRequestComm(orderId)
          : null;
      return res.json({
        success: true,
        action: "send_proof_request",
        details: out,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return res.status(500).json({ success: false, message: msg });
    }
  }

  if (comms && /\b(pickup\s+ready|send\s+pickup)\b/i.test(message)) {
    const orderId = extractOrderIdFromMessage(message);
    if (!orderId) {
      return res.json({
        success: false,
        message: "Include order id (UUID or order #)",
      });
    }
    try {
      const out = await comms.sendPickupReady(orderId);
      return res.json({
        success: true,
        action: "send_pickup_ready",
        details: out,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return res.status(500).json({ success: false, message: msg });
    }
  }

  let intent = null;
  if (low.includes("invoice")) intent = "invoice";
  else if (low.includes("customer")) intent = "customer";
  else if (low.includes("orders")) intent = "orders";

  if (!intent) {
    const advised = await runOperatorWithContext(message, systemContext, skill);
    const text =
      advised.data &&
      (String(advised.data.message || "").trim() ||
        String(advised.data.reasoning || "").trim());
    if (advised.ok && advised.data && text) {
      return res.json({
        success: true,
        action: advised.data.action,
        skill: skill || null,
        reasoning: advised.data.reasoning,
        priority: advised.data.priority,
        message: String(advised.data.message || "").trim() || advised.data.reasoning,
        contextLoaded: !!(systemContext && systemContext.success),
      });
    }
    try {
      memoryCompat.logDecision(
        "unknown_ai_command",
        { message, skill: skill || null },
        { contextLoaded: !!(systemContext && systemContext.success) },
        "unmatched",
        "Operator could not determine deterministic or AI action"
      );
    } catch (_) {
      /* optional */
    }
    return res.json({
      success: false,
      skill: skill || null,
      message: "Could not determine action",
      contextLoaded: !!(systemContext && systemContext.success),
    });
  }

  try {
    if (intent === "orders") {
      const queue = await getProductionQueue();
      return res.json({
        success: true,
        action: "orders_listed",
        details: { queue },
      });
    }

    await initializeSquareIntegration();
    const customers = await squareService.getCustomers("");

    if (intent === "customer") {
      const extracted = await extractEntities(message, systemContext);
      const hint = extracted.customerName || message.replace(/customer/i, "").trim();
      const id = matchSquareCustomerId(hint, customers);
      const matches = customers
        .map((c) => ({
          id: c.id,
          name:
            [c.given_name, c.family_name].filter(Boolean).join(" ").trim() ||
            c.company_name ||
            c.id,
          email:
            typeof c.email_address === "string"
              ? c.email_address
              : c.email_address && c.email_address.email_address
                ? String(c.email_address.email_address)
                : "",
        }))
        .filter((row) => {
          if (!hint) return true;
          return String(row.name).toLowerCase().includes(hint.toLowerCase());
        })
        .slice(0, 25);

      return res.json({
        success: true,
        action: "customer_lookup",
        details: {
          query: hint,
          matchedCustomerId: id || null,
          matches,
        },
      });
    }

    if (intent === "invoice") {
      const extracted = await extractEntities(message, systemContext);
      const matched = await squareService.getCustomerByName(extracted.customerName);
      const customerId = matched && matched.id ? matched.id : null;
      if (!customerId) {
        return res.json({
          success: false,
          message: `Could not find Square customer for "${extracted.customerName || "unknown"}"`,
          details: { extracted },
        });
      }

      const result = await squareService.createDraftInvoice({
        customerId,
        lineItems: [
          {
            name: extracted.itemName,
            quantity: extracted.quantity,
            price: extracted.unitPrice,
          },
        ],
      });

      if (!result.success) {
        return res.json({
          success: false,
          message: result.error || "draft invoice failed",
          details: { extracted },
        });
      }

      return res.json({
        success: true,
        action: "invoice_created",
        squareInvoiceId: result.squareInvoiceId || result.invoiceId,
        amount: result.amount,
        status: result.status || "DRAFT",
        details: {
          invoiceId: result.invoiceId || result.squareInvoiceId,
          customerName: extracted.customerName,
          quantity: extracted.quantity,
          itemName: extracted.itemName,
          unitPrice: extracted.unitPrice,
        },
      });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(500).json({
      success: false,
      message: msg,
    });
  }
}

router.post("/run", handleOperatorRunRequest);

module.exports = router;
module.exports.handleOperatorRunRequest = handleOperatorRunRequest;
