const { interpretQuery } = require("./queryEngine");
const { createInvoice } = require("./squareWriteService");
const { getInvoices } = require("./squareDataService");
const { normalizeInvoicesToJobs } = require("./jobNormalizer");
const { saveJob, upsertJobs } = require("../data/store");
const { getOperatingSystemJobs } = require("./foundationJobMerge");
const { createFoundationJob } = require("./foundationJobService");
const { generateActions } = require("./actionEngine");
const { buildFullProductionReport } = require("./productionEngine");
const { buildTodayPlan } = require("./dayPlanner");
const { planNext7Days } = require("./scheduler");
const { generatePurchaseList } = require("./purchasingEngine");
const { checkInventory } = require("./inventoryEngine");
const { summarizeJobs } = require("./financeEngine");

function normalize(s) { return String(s || "").toLowerCase().trim(); }

function detectCommandType(input) {
  const q = normalize(input);
  if (!q) return { type: "UNKNOWN" };

  if (/(^|\s)(create|send|issue|make)\s+(an?\s+)?invoice/.test(q) || /invoice for/.test(q)) {
    return { type: "CREATE_INVOICE" };
  }
  if (/(^|\s)(create|add|new)\s+(a\s+)?job/.test(q) || /add job/.test(q)) {
    return { type: "ADD_JOB" };
  }
  return { type: "QUERY" };
}

function extractQuantity(text) {
  const s = String(text || "");
  const m = s.match(/(\d{1,5})\s+(?:[a-z]+\s+){0,3}?(shirts?|tees?|hoodies?|hoods?|hats?|polos?|tanks?|jackets?|pullovers?|crewnecks?|beanies?)/i);
  if (m) {
    const noun = m[2].toLowerCase().replace(/s$/, "").toUpperCase();
    return { qty: Number(m[1]), garment: noun };
  }
  const any = s.match(/(\d{1,5})/);
  return { qty: any ? Number(any[1]) : 0, garment: null };
}

function extractCustomer(text) {
  const s = String(text || "");
  const matches = [...s.matchAll(/\bfor\s+([A-Z][A-Za-z&'.-]+(?:\s+(?:[A-Z][A-Za-z&'.-]+|of|the|and|&))*)/g)];
  for (let i = matches.length - 1; i >= 0; i--) {
    const candidate = matches[i][1].trim().replace(/\s+(of|the|and|&)$/i, "").trim();
    if (!/^(shirts?|tees?|hoodies?|hats?|polos?|tanks?|the|a|an|my|our)\b/i.test(candidate)) {
      return candidate;
    }
  }
  const m2 = s.match(/\bto\s+([A-Z][A-Za-z&'.-]+(?:\s+[A-Z][A-Za-z&'.-]+){0,3})/);
  if (m2) return m2[1].trim();
  return null;
}

function extractColor(text) {
  const colors = ["black", "white", "navy", "red", "blue", "green", "gray", "grey", "purple", "pink", "yellow", "orange", "charcoal", "heather"];
  const t = normalize(text);
  for (const c of colors) {
    if (t.includes(c)) return c.toUpperCase();
  }
  return null;
}

function extractPrintMethod(text) {
  const t = normalize(text);
  if (t.includes("embroider")) return "EMBROIDERY";
  if (t.includes("screen")) return "SCREEN";
  if (t.includes("dtg")) return "DTG";
  if (t.includes("dtf")) return "DTF";
  if (t.includes("heat press") || t.includes("vinyl")) return "HEAT_PRESS";
  return null;
}

function extractUnitPrice(text) {
  const m = String(text || "").match(/\$\s*(\d{1,4}(?:\.\d{1,2})?)\s*(?:each|per|\/each|\/unit)?/i);
  if (m) return Number(m[1]);
  return null;
}

async function buildContext() {
  const { invoices, mock, reason } = await getInvoices();
  upsertJobs(normalizeInvoicesToJobs(invoices));
  const jobs = await getOperatingSystemJobs();
  return { jobs, mock, reason };
}

async function handleCreateInvoice(input, body) {
  const qtyInfo = extractQuantity(input);
  const color = extractColor(input);
  const method = extractPrintMethod(input);
  const customer = extractCustomer(input);
  const unitPrice = extractUnitPrice(input);

  const data = {
    qty: Number(body && body.qty) || qtyInfo.qty,
    garment: (body && body.garment) || qtyInfo.garment || "SHIRT",
    color: (body && body.color) || color,
    customer: (body && body.customer) || customer || "Unknown Customer",
    printMethod: (body && body.printMethod) || method,
    unitPrice: (body && body.unitPrice) || unitPrice,
    notes: (body && body.notes) || input,
    dueDate: body && body.dueDate ? body.dueDate : null,
    confirm: body && body.confirm === true,
  };

  const result = await createInvoice(data);
  return { type: "action", action: "CREATE_INVOICE", result, mock: Boolean(result.mock) };
}

async function handleAddJob(input, body) {
  const qtyInfo = extractQuantity(input);
  const color = extractColor(input);
  const method = extractPrintMethod(input);
  const customer = extractCustomer(input) || (body && body.customer) || "Unknown Customer";
  const garment = qtyInfo.garment || (body && body.garment) || "SHIRT";
  const qty = Number(body && body.qty) || qtyInfo.qty || 0;

  const lineItems = qty > 0
    ? [{ qty, garment, color: color || null, product: garment, quantity: qty }]
    : (Array.isArray(body && body.lineItems) ? body.lineItems : []);

  const foundationPayload = {
    customerName: customer,
    items: lineItems.map((li) => ({
      product: li.product || li.garment || "Item",
      color: li.color,
      size: li.size,
      quantity: Number(li.qty || li.quantity) || 0,
    })),
    printMethod: method || (body && body.productionType) || "UNKNOWN",
    notes: (body && body.notes) || input,
    dueDate: body && body.dueDate ? body.dueDate : null,
    depositPaid: body && body.depositPaid === true,
    hasArt: body && body.hasArt === true,
  };

  const created = await createFoundationJob(foundationPayload);
  if (created.success && created.job) {
    const j = created.job;
    saveJob({
      jobId: j.jobId,
      customer: j.customer,
      lineItems: j.lineItems,
      notes: foundationPayload.notes,
      dueDate: j.dueDate,
      productionType: j.printMethod,
      printMethod: j.printMethod,
      status: j.status,
      source: "command+foundation",
      hasArt: j.hasArt,
      depositPaid: j.depositPaid,
      foundationStatus: j.foundationStatus,
    });
    console.log("[commandRouter] JOB CREATED (foundation):", j.jobId);
    return { type: "action", action: "ADD_JOB", result: { success: true, job: j }, mock: false };
  }

  const job = saveJob({
    customer,
    status: "UNPAID",
    productionType: method || (body && body.productionType) || "UNKNOWN",
    printMethod: method || null,
    lineItems: qty > 0 ? [{ qty, garment, color: color || null }] : (Array.isArray(body && body.lineItems) ? body.lineItems : []),
    notes: (body && body.notes) || input,
    dueDate: body && body.dueDate ? body.dueDate : null,
    source: "command",
  });
  console.log("[commandRouter] JOB CREATED via command (store):", job && job.jobId);
  return { type: "action", action: "ADD_JOB", result: { success: true, job }, mock: false };
}

async function handleQuery(input) {
  const ctx = await buildContext();
  const result = interpretQuery(input, ctx.jobs);
  const actions = generateActions(ctx.jobs);
  const production = buildFullProductionReport(ctx.jobs);
  const { plan } = buildTodayPlan(production.ready, production.batches);
  const schedule = planNext7Days(ctx.jobs);
  const purchaseList = generatePurchaseList(ctx.jobs);
  const inventory = checkInventory(purchaseList);
  const financials = summarizeJobs(ctx.jobs);

  return {
    type: "query",
    result: {
      intent: result.intent,
      answer: result.answer,
      count: Array.isArray(result.jobs) ? result.jobs.length : 0,
      jobs: result.jobs,
      actions,
      queue: production.queue,
      production: { ready: production.ready, batches: production.batches, tasks: production.tasks, blocked: production.blocked },
      routing: production.routing,
      vendors: production.vendors,
      purchasing: { list: purchaseList, inventory },
      financials,
      plan,
      schedule,
    },
    mock: Boolean(ctx.mock),
    reason: ctx.reason,
  };
}

async function routeCommand(parsedCommand) {
  const input = String((parsedCommand && (parsedCommand.input || parsedCommand.text)) || "");
  const body = parsedCommand && typeof parsedCommand === "object" ? parsedCommand : {};
  const { type } = detectCommandType(input);
  console.log("[commandRouter] COMMAND:", type, "INPUT:", input.slice(0, 120));

  if (type === "CREATE_INVOICE") return handleCreateInvoice(input, body);
  if (type === "ADD_JOB") return handleAddJob(input, body);
  return handleQuery(input);
}

module.exports = {
  routeCommand,
  detectCommandType,
  extractQuantity,
  extractCustomer,
  extractColor,
  extractPrintMethod,
  buildContext,
  handleCreateInvoice,
  handleAddJob,
  handleQuery,
};
