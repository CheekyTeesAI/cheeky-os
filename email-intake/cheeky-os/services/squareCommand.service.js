"use strict";

const path = require("path");

function getPrisma() {
  try {
    return require(path.join(__dirname, "..", "..", "src", "lib", "prisma"));
  } catch (_e) {
    return null;
  }
}

/**
 * @param {string} command
 * @returns {{ category: string, reason?: string }}
 */
function classifySquareCommand(command) {
  const c = String(command || "").trim();
  const low = c.toLowerCase();
  if (!low) return { category: "APPROVAL_REQUIRED", reason: "empty" };

  if (
    /bypass\s+deposit|skip\s+deposit|ignore\s+deposit/i.test(c) ||
    /refund|charge\s+card|charge\s+customer|capture\s+payment|process\s+payment|take\s+payment/i.test(low) ||
    /delete\s+square\s+customer|remove\s+customer/i.test(low) ||
    /webhook|modify\s+payment|square\s+webhook/i.test(low)
  ) {
    return { category: "BLOCKED", reason: "policy" };
  }

  if (
    /\bsend\b/.test(low) &&
    /invoice|estimate|square/.test(low) &&
    !/draft|prepare/.test(low)
  ) {
    return { category: "APPROVAL_REQUIRED", reason: "send_document" };
  }

  if (/create\s+(?:a\s+)?square\s+(?:invoice|estimate)/i.test(c) && !/draft|prepare/i.test(low)) {
    return { category: "APPROVAL_REQUIRED", reason: "explicit_create" };
  }

  if (
    /payment\s+status|invoice\s+status|square\s+status|lookup\s+invoice/i.test(low) ||
    /customer\s+balance|order\s+financial|balance\s+due\s+for|how\s+much\s+(?:is\s+)?owed/i.test(low) ||
    /financial\s+summary|amount\s+paid/i.test(low)
  ) {
    return { category: "READ_ONLY", reason: "status_lookup" };
  }

  if (
    /prepare\s+(?:an?\s+)?invoice|draft\s+invoice|prepare\s+estimate|draft\s+estimate/i.test(low) ||
    /prepare\s+balance|balance\s+request|prepare\s+deposit|deposit\s+request/i.test(low)
  ) {
    return { category: "DRAFT_ONLY", reason: "local_draft" };
  }

  if (/invoice|estimate|square|payment|balance\s+due|deposit/i.test(low)) {
    return { category: "APPROVAL_REQUIRED", reason: "square_default" };
  }

  return { category: "APPROVAL_REQUIRED", reason: "unknown_default" };
}

/**
 * Infer draft type from natural language.
 * @param {string} command
 * @returns {"ESTIMATE"|"INVOICE"|"DEPOSIT_REQUEST"|"BALANCE_DUE"}
 */
function inferSquareDraftType(command) {
  const low = String(command || "").toLowerCase();
  if (/estimate|quote\b/i.test(low)) return "ESTIMATE";
  if (/deposit\b/i.test(low)) return "DEPOSIT_REQUEST";
  if (/balance|remainder|due\b|remainder/i.test(low)) return "BALANCE_DUE";
  return "INVOICE";
}

/**
 * Best-effort order id from command (cuid-ish or uuid-ish).
 * @param {string} command
 */
function extractOrderIdHint(command) {
  const c = String(command || "");
  const m =
    c.match(/\border[\s#:=]+([a-z0-9_-]{15,40})\b/i) ||
    c.match(/\b([c-f0-9]{24,32})\b/i) ||
    c.match(/\b([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f-]+)\b/i);
  return m ? m[1] : null;
}

/**
 * @param {string} orderId
 */
async function getOrderFinancialStatus(orderId) {
  const warnings = [];
  const oid = String(orderId || "").trim();
  if (!oid) {
    return {
      ok: false,
      orderId: "",
      squareInvoiceId: null,
      squareOrderId: null,
      amountPaid: 0,
      depositPaidAt: null,
      balanceDue: 0,
      status: null,
      warnings: ["missing_order_id"],
    };
  }

  const prisma = getPrisma();
  if (!prisma || !prisma.order) {
    return {
      ok: true,
      orderId: oid,
      squareInvoiceId: null,
      squareOrderId: null,
      amountPaid: 0,
      depositPaidAt: null,
      balanceDue: 0,
      status: null,
      warnings: ["database_unavailable"],
    };
  }

  try {
    const o = await prisma.order.findFirst({
      where: { id: oid, deletedAt: null },
      select: {
        id: true,
        status: true,
        squareInvoiceId: true,
        squareOrderId: true,
        amountPaid: true,
        depositPaidAt: true,
        totalAmount: true,
        quotedAmount: true,
        total: true,
      },
    });

    if (!o) {
      return {
        ok: true,
        orderId: oid,
        squareInvoiceId: null,
        squareOrderId: null,
        amountPaid: 0,
        depositPaidAt: null,
        balanceDue: 0,
        status: null,
        warnings: ["order_not_found"],
      };
    }

    const tot =
      Number(o.totalAmount ?? 0) ||
      Number(o.quotedAmount ?? 0) ||
      Number(o.total ?? 0) ||
      0;
    const paid = Number(o.amountPaid ?? 0) || 0;
    const balanceDue = Math.max(0, Math.round((tot - paid) * 100) / 100);

    /* Optional: Square invoice status via existing route pattern — keep local only per fail-safe */
    if (o.squareInvoiceId && !process.env.SQUARE_ACCESS_TOKEN) {
      warnings.push("square_token_unavailable_for_remote_enrichment");
    }

    return {
      ok: true,
      orderId: o.id,
      squareInvoiceId: o.squareInvoiceId || null,
      squareOrderId: o.squareOrderId || null,
      amountPaid: paid,
      depositPaidAt: o.depositPaidAt ? o.depositPaidAt.toISOString() : null,
      balanceDue,
      status: o.status || null,
      warnings: warnings.length ? warnings : undefined,
    };
  } catch (e) {
    return {
      ok: true,
      orderId: oid,
      squareInvoiceId: null,
      squareOrderId: null,
      amountPaid: 0,
      depositPaidAt: null,
      balanceDue: 0,
      status: null,
      warnings: ["load_error:" + (e && e.message ? e.message : String(e))],
    };
  }
}

/**
 * @param {object} draft - from store
 */
async function createSquareDraftFromApproved(draft) {
  const type = String(draft.type || "").toUpperCase();
  const lineItems = (() => {
    try {
      const j = JSON.parse(draft.lineItemsJson || "[]");
      return Array.isArray(j) ? j : [];
    } catch {
      return [];
    }
  })();

  if (type === "INVOICE" || type === "DEPOSIT_REQUEST" || type === "BALANCE_DUE") {
    const customerId = draft.customerId ? String(draft.customerId).trim() : "";
    if (!customerId) {
      return { ok: false, error: "customerId_required_for_square_invoice" };
    }

    let items = lineItems;
    if (!items.length && Number(draft.amount) > 0) {
      items = [
        {
          name: draft.title || "Line item",
          quantity: 1,
          price: Number(draft.amount),
        },
      ];
    }
    if (!items.length) {
      return { ok: false, error: "lineItems_or_amount_required" };
    }

    try {
      const { createDraftInvoice } = require("./squareDraftInvoice");
      const result = await createDraftInvoice({
        customerId,
        lineItems: items.map((x) => ({
          name: x.name || x.description || "Item",
          quantity: x.quantity != null ? x.quantity : 1,
          price: Number(x.price != null ? x.price : x.amount || 0),
        })),
      });
      if (!result.success) {
        return { ok: false, error: result.error || "square_invoice_failed" };
      }
      return {
        ok: true,
        squareDraftId: result.invoiceId || null,
        mode: "square_invoice_draft",
        status: result.status || "DRAFT",
      };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }

  if (type === "ESTIMATE") {
    const prisma = getPrisma();
    if (!prisma || !prisma.estimate) {
      return { ok: false, error: "estimate_table_unavailable" };
    }
    try {
      const orderId = draft.orderId || null;
      if (orderId) {
        const existing = await prisma.estimate.findFirst({ where: { orderId } });
        if (existing) {
          return {
            ok: true,
            squareDraftId: null,
            localEstimateId: existing.id,
            mode: "prisma_estimate_existing",
          };
        }
      }
      const desc = String(draft.notes || draft.title || "Estimate draft").slice(0, 2000);
      const created = await prisma.estimate.create({
        data: {
          name: "Estimate request",
          email: null,
          phone: null,
          qty: 1,
          description: desc,
          htmlBody: `<p>${desc}</p>`,
          status: "DRAFT",
          orderId: orderId || undefined,
        },
        select: { id: true },
      });
      return {
        ok: true,
        squareDraftId: null,
        localEstimateId: created.id,
        mode: "prisma_estimate_draft",
      };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }

  return { ok: false, error: "unsupported_type" };
}

module.exports = {
  classifySquareCommand,
  inferSquareDraftType,
  extractOrderIdHint,
  getOrderFinancialStatus,
  createSquareDraftFromApproved,
};
