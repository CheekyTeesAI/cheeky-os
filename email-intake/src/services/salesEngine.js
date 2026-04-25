/**
 * Daily Sales Engine — prioritized cold-call targets from Square reporting data.
 * Reuses squareReportingService only (read-only).
 */

const path = require("path");
const { fetchSafe } = require(path.join(
  __dirname,
  "..",
  "..",
  "cheeky-os",
  "utils",
  "fetchSafe"
));
const squareReportingService = require("./squareReportingService.js");
const memoryService = require("./memoryService.js");
const memory = require("./memory.js");

const MS_DAY = 24 * 60 * 60 * 1000;

function daysSince(iso) {
  if (!iso) return 9999;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return 9999;
  return Math.floor((Date.now() - t) / MS_DAY);
}

function add(points, reason, parts) {
  parts.push({ points, reason });
}

/**
 * Required scoring model:
 * - old estimate or stale open opportunity: +10
 * - last order > 60 days: +8
 * - total spend > 500: +3
 * - VIP: +5
 */
function scoreCustomer(c) {
  const parts = [];
  const recencyDays = daysSince(c.lastOrderDate);
  const hasOldEstimate =
    (Number(c.unpaidInvoices) || 0) > 0 ||
    (Number(c.recentEstimates) || 0) > 0;
  if (hasOldEstimate) add(10, "Old estimate / stale open opportunity", parts);
  if (recencyDays > 60) add(8, "Last order older than 60 days", parts);
  if ((Number(c.totalSpend) || 0) > 500) add(3, "Total spend above $500", parts);
  const vip = (Number(c.totalSpend) || 0) > 2000 || (Number(c.numberOfOrders) || 0) >= 8;
  if (vip) add(5, "VIP customer profile", parts);
  if (parts.length === 0) {
    add(1, "Low urgency", parts);
  }
  const score = parts.reduce((sum, p) => sum + p.points, 0);
  const reason = parts[0] ? parts[0].reason : "General follow-up";
  return { score, reason, parts, vip };
}

async function getCustomerSalesFacts() {
  const [customers, orders, invoices] = await Promise.all([
    squareReportingService.getCustomers(),
    squareReportingService.getOrders({
      start: new Date(Date.now() - 365 * MS_DAY),
      end: new Date(),
    }),
    squareReportingService.getInvoices(),
  ]);

  const byCustomer = new Map();
  for (const c of customers || []) {
    byCustomer.set(c.id, {
      customerId: c.id,
      name: c.name || c.email || c.id,
      email: c.email || "",
      phone: c.phone || "",
      lastOrderDate: null,
      totalSpend: 0,
      numberOfOrders: 0,
      unpaidInvoices: 0,
      recentEstimates: 0,
    });
  }

  for (const o of orders || []) {
    const id = o.customerId || "UNKNOWN";
    if (!byCustomer.has(id)) {
      byCustomer.set(id, {
        customerId: id,
        name: id,
        email: "",
        phone: "",
        lastOrderDate: null,
        totalSpend: 0,
        numberOfOrders: 0,
        unpaidInvoices: 0,
        recentEstimates: 0,
      });
    }
    const row = byCustomer.get(id);
    row.totalSpend += Number(o.total) || 0;
    row.numberOfOrders += 1;
    const created = String(o.createdAt || "");
    if (!row.lastOrderDate || created > row.lastOrderDate) {
      row.lastOrderDate = created;
    }
  }

  for (const inv of invoices || []) {
    const id = inv.customerId || "UNKNOWN";
    if (!byCustomer.has(id)) {
      byCustomer.set(id, {
        customerId: id,
        name: id,
        email: "",
        phone: "",
        lastOrderDate: null,
        totalSpend: 0,
        numberOfOrders: 0,
        unpaidInvoices: 0,
        recentEstimates: 0,
      });
    }
    const row = byCustomer.get(id);
    const st = String(inv.status || "").toUpperCase();
    if (st && !["PAID", "CANCELED"].includes(st)) {
      row.unpaidInvoices += 1;
    }
    if (st === "DRAFT" && daysSince(inv.createdAt) <= 60) {
      row.recentEstimates += 1;
    }
  }

  return Array.from(byCustomer.values()).map((r) => {
    r.totalSpend = Math.round(r.totalSpend * 100) / 100;
    return r;
  });
}

async function getDailyCallList(limit = 5) {
  const lim = Math.max(1, Math.min(10, Number(limit) || 5));
  const facts = await getCustomerSalesFacts();
  const leads = facts
    .map((c) => {
      const scored = scoreCustomer(c);
      return {
        name: c.name,
        customerId: c.customerId,
        email: c.email || "",
        phone: c.phone || "",
        score: scored.score,
        lastOrder: c.lastOrderDate,
        lastContact: c.lastOrderDate,
        totalSpend: c.totalSpend,
        numberOfOrders: c.numberOfOrders,
        unpaidInvoices: c.unpaidInvoices,
        recentEstimates: c.recentEstimates,
        reason: scored.reason,
        suggestedScript: `Hi ${c.name || "there"}, this is Cheeky Tees checking in on your project. I can help you move forward today.`,
        vip: scored.vip,
      };
    })
    .sort((a, b) => b.score - a.score || b.totalSpend - a.totalSpend)
    .slice(0, lim);

  try {
    memoryService.logEvent("daily_sales_targets_generated", {
      count: leads.length,
      limit: lim,
    });
    memory.logDecision(
      "sales_call_list",
      { limit: lim },
      { count: leads.length, leads: leads.slice(0, 3) },
      "success",
      "Daily sales call list generated"
    );
  } catch (_) {
    /* optional */
  }

  return leads;
}

async function getAiCallList(limit = 5) {
  const leads = await getDailyCallList(limit);
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return {
      leads,
      insights: "[Insights unavailable: OPENAI_API_KEY not set]",
    };
  }
  const prompt = `You are a sales expert.\nRank and explain who to call first and why.\n\nLeads:\n${JSON.stringify(leads, null, 2)}`;
  const ai = await fetchSafe("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "You are concise and practical." },
        { role: "user", content: prompt },
      ],
      temperature: 0.25,
      max_tokens: 600,
    }),
  });
  if (!ai.ok) {
    return {
      leads,
      insights: `[AI call-list summary unavailable: ${ai.error || "request failed"}]`,
    };
  }
  const insights =
    ai.data &&
    ai.data.choices &&
    ai.data.choices[0] &&
    ai.data.choices[0].message
      ? String(ai.data.choices[0].message.content || "").trim()
      : "";
  return { leads, insights: insights || "[AI call-list summary empty]" };
}

function logSalesOutcome(customerId, outcome) {
  const out = String(outcome || "").toLowerCase();
  const allowed = ["answered", "voicemail", "noanswer", "ordered"];
  const finalOutcome = allowed.includes(out) ? out : "noanswer";
  const row = memory.logDecision(
    "sales_call_outcome",
    { customerId: String(customerId || "") },
    { outcome: finalOutcome },
    "logged",
    "Sales call outcome logged"
  );
  return { success: true, outcome: finalOutcome, loggedAt: row.timestamp };
}

module.exports = {
  scoreCustomer,
  getDailyCallList,
  getAiCallList,
  logSalesOutcome,
};
