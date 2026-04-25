/**
 * Chad Command Router — deterministic command layer (thin wrapper).
 * No NLP/AI here; this maps short structured commands to existing services.
 */

const path = require("path");
const squareService = require("./squareService.js");
const autopilotService = require("./autopilotService.js");
const squareReportingService = require("./squareReportingService.js");

function loadDistService(fileName) {
  try {
    return require(path.join(__dirname, "..", "..", "dist", "services", fileName));
  } catch {
    return null;
  }
}

function normalize(input) {
  return String(input || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function extractOrderId(text) {
  const s = String(text || "");
  const uuid = s.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  if (uuid) return uuid[0];
  const tagged = s.match(/\b(?:order\s*)?#?\s*([a-z0-9.-]{3,})\b/i);
  return tagged ? tagged[1] : "";
}

function parseInvoiceBits(normalized) {
  const body = normalized.replace(/^invoice\s+/, "").trim();
  const qtyMatch =
    body.match(/\b(\d+)\s*(shirts?|hoodies?|tees?|pcs|pieces)\b/i) ||
    body.match(/\b(\d+)\b/);
  const quantity = qtyMatch ? Math.max(1, parseInt(qtyMatch[1], 10)) : 1;

  let customerName = body;
  if (qtyMatch) customerName = body.slice(0, qtyMatch.index).trim();
  if (!customerName) customerName = "unknown";

  let itemName = "Custom item";
  if (qtyMatch && qtyMatch[2]) itemName = qtyMatch[2];
  return { customerName, quantity, itemName, unitPrice: 25 };
}

/**
 * Parse a structured command.
 * @param {string} input
 * @returns {{ matched: boolean, normalized: string, action?: string, target?: string, params?: any }}
 */
function routeCommand(input) {
  const normalized = normalize(input);
  if (!normalized) return { matched: false, normalized };
  const words = normalized.split(" ");
  const action = words[0];
  const target = words[1] || "";

  if (action === "quote") {
    return { matched: true, normalized, action: "QUOTE", target: "quote" };
  }

  if (action === "invoice") {
    return {
      matched: true,
      normalized,
      action: "INVOICE",
      target: "draft",
      params: parseInvoiceBits(normalized),
    };
  }

  if (action === "check" && target === "deposits") {
    return { matched: true, normalized, action: "CHECK", target: "deposits" };
  }

  if (action === "report") {
    if (target === "weekly" || target === "week") {
      return { matched: true, normalized, action: "REPORT", target: "weekly" };
    }
    if (target === "daily" || target === "today") {
      return { matched: true, normalized, action: "REPORT", target: "daily" };
    }
    if (target === "customers") {
      return { matched: true, normalized, action: "REPORT", target: "customers" };
    }
    if (target === "outstanding" || target === "unpaid") {
      return { matched: true, normalized, action: "REPORT", target: "outstanding" };
    }
    if (target === "summary") {
      return { matched: true, normalized, action: "REPORT", target: "summary" };
    }
  }

  if (action === "autopilot" && (target === "run" || target === "plan")) {
    return {
      matched: true,
      normalized,
      action: "AUTOPILOT",
      target,
    };
  }

  if (action === "pickup" && target === "ready") {
    const orderId = extractOrderId(normalized.replace(/^pickup\s+ready\s*/, ""));
    if (!orderId) return { matched: false, normalized };
    return {
      matched: true,
      normalized,
      action: "PICKUP",
      target: "ready",
      params: { orderId },
    };
  }

  if (action === "proof" && (target === "send" || target === "approve")) {
    const orderId = extractOrderId(normalized.replace(/^proof\s+(send|approve)\s*/, ""));
    if (!orderId) return { matched: false, normalized };
    return {
      matched: true,
      normalized,
      action: "PROOF",
      target,
      params: { orderId },
    };
  }

  if (action === "art" && (target === "needed" || target === "ready")) {
    const params = {};
    if (target === "ready") {
      const orderId = extractOrderId(normalized.replace(/^art\s+ready\s*/, ""));
      if (!orderId) return { matched: false, normalized };
      params.orderId = orderId;
    }
    return {
      matched: true,
      normalized,
      action: "ART",
      target,
      params,
    };
  }

  return { matched: false, normalized };
}

async function executeRoutedCommand(route) {
  const dep = loadDistService("depositFollowupService.js");
  const quote = loadDistService("quoteEngine.js");
  const comms = loadDistService("customerCommsService.js");
  const proof = loadDistService("proofRoutingService.js");
  const art = loadDistService("artRoutingService.js");

  if (route.action === "QUOTE") {
    if (!quote || typeof quote.parseLooseQuoteFromText !== "function") {
      throw new Error("Quote engine unavailable");
    }
    const parsed = quote.parseLooseQuoteFromText(route.normalized);
    if (!parsed || !quote.validateQuoteInput(parsed).ok) {
      return {
        ok: false,
        message: "Quote input incomplete. Example: quote 24 shirts dtf",
      };
    }
    const result = quote.calculateQuote(parsed);
    return { ok: true, quote: result };
  }

  if (route.action === "INVOICE") {
    const bits = route.params || {};
    const matched = await squareService.getCustomerByName(bits.customerName || "");
    if (!matched || !matched.id) {
      return { ok: false, message: `Customer not found: ${bits.customerName || "unknown"}` };
    }
    const out = await squareService.createDraftInvoice({
      customerId: matched.id,
      lineItems: [
        {
          name: bits.itemName || "Custom item",
          quantity: bits.quantity || 1,
          price: bits.unitPrice || 25,
        },
      ],
    });
    return out.success
      ? {
          ok: true,
          squareInvoiceId: out.squareInvoiceId || out.invoiceId,
          amount: out.amount,
          status: out.status || "DRAFT",
        }
      : { ok: false, message: out.error || "Invoice failed" };
  }

  if (route.action === "CHECK" && route.target === "deposits") {
    if (!dep || typeof dep.buildDepositFollowupsPayload !== "function") {
      throw new Error("Deposit followup service unavailable");
    }
    const out = await dep.buildDepositFollowupsPayload();
    return { ok: true, ...out };
  }

  if (route.action === "REPORT") {
    if (route.target === "daily") return { ok: true, data: await squareReportingService.getDailySales() };
    if (route.target === "weekly") return { ok: true, data: await squareReportingService.getWeeklySales() };
    if (route.target === "customers") return { ok: true, data: await squareReportingService.getTopCustomers() };
    if (route.target === "outstanding") return { ok: true, data: await squareReportingService.getOutstandingInvoices() };
    if (route.target === "summary") return { ok: true, data: await squareReportingService.getAiSummary() };
  }

  if (route.action === "AUTOPILOT") {
    if (route.target === "plan") {
      const p = await autopilotService.getAutopilotPlan();
      return { ok: true, count: p.items.length, items: p.items };
    }
    if (route.target === "run") {
      const out = await autopilotService.runAutopilotExecution({ mode: "safe" });
      return { ok: true, ...out };
    }
  }

  if (route.action === "PICKUP" && route.target === "ready") {
    if (!comms || typeof comms.sendPickupReady !== "function") {
      throw new Error("Comms service unavailable");
    }
    const out = await comms.sendPickupReady(route.params.orderId);
    return { ok: true, ...out };
  }

  if (route.action === "PROOF") {
    if (!proof) throw new Error("Proof service unavailable");
    if (route.target === "send") {
      const out = await proof.sendProofForOrder(route.params.orderId);
      return { ok: true, ...out };
    }
    if (route.target === "approve") {
      await proof.approveProof(route.params.orderId);
      return { ok: true, orderId: route.params.orderId, status: "APPROVED" };
    }
  }

  if (route.action === "ART") {
    if (!art) throw new Error("Art service unavailable");
    if (route.target === "needed") {
      const orders = await art.listOrdersNeedingArt();
      return { ok: true, orders };
    }
    if (route.target === "ready") {
      await art.markArtReady(route.params.orderId);
      return { ok: true, orderId: route.params.orderId, status: "READY" };
    }
  }

  return { ok: false, message: "No command handler found" };
}

function getSupportedCommands() {
  return {
    success: true,
    commands: [
      "quote 24 shirts dtf",
      "invoice john 50 shirts",
      "check deposits",
      "report daily",
      "report weekly",
      "report customers",
      "report outstanding",
      "report summary",
      "autopilot plan",
      "autopilot run",
      "pickup ready 123",
      "proof send 123",
      "proof approve 123",
      "art needed",
      "art ready 123",
    ],
    actions: ["QUOTE", "INVOICE", "CHECK", "REPORT", "AUTOPILOT", "PICKUP", "PROOF", "ART"],
  };
}

module.exports = {
  routeCommand,
  executeRoutedCommand,
  getSupportedCommands,
};
