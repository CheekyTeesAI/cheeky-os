/**
 * Cheeky OS — Command executor.
 * Executes routed actions (voice, shortcuts, POST /commands/run, keyword router).
 *
 * @module cheeky-os/commands/executor
 */

const { runFollowupCycle, getHotDeals, getNextSalesActions } = require("../followup/engine");
const { store } = require("../data/provider");
const { logger } = require("../utils/logger");
const { runFollowups } = require("../engine/followup");
const { getCashSummary } = require("../engine/cash");
const { getProductionQueue } = require("../engine/production");
const { runOutreach } = require("../engine/leads");
const { generateQuote, closeDeal } = require("../engine/sales");
const { createSquareInvoice } = require("../integrations/square");
const { validateBuild } = require("../safety/validate-build");
const { rollback: gitRollback } = require("../safety/rollback");

/**
 * Execute a routed command.
 * @param {{ action: string, params: object }} command
 * @returns {Promise<{ ok: boolean, data: any, error: string|null }>}
 */
async function executeCommand({ action, params }) {
  const p = params && typeof params === "object" ? params : {};
  try {
    switch (action) {
      case "run_followups": {
        const result = await runFollowups();
        return { ok: result.ok, data: result.data, error: result.error };
      }

      case "get_hot": {
        const hot = getHotDeals();
        return { ok: true, data: { count: hot.length, records: hot }, error: null };
      }

      case "get_unpaid": {
        const open = await store.getOpenDeals();
        const records = Array.isArray(open) ? open : open?.data || [];
        return { ok: true, data: { count: records.length, records }, error: null };
      }

      case "get_next": {
        const actions = getNextSalesActions();
        return { ok: true, data: { count: actions.length, actions }, error: null };
      }

      case "get_cash_summary": {
        const result = await getCashSummary();
        return { ok: result.ok, data: result.data, error: result.error };
      }

      case "get_production_queue": {
        const result = await getProductionQueue();
        return { ok: result.ok, data: result.data, error: result.error };
      }

      case "outreach_leads": {
        const result = await runOutreach();
        return { ok: result.ok, data: result.data, error: result.error };
      }

      case "get_health": {
        return {
          ok: true,
          data: { status: "healthy", timestamp: new Date().toISOString() },
          error: null,
        };
      }

      case "trigger_build": {
        const r = validateBuild();
        return { ok: r.ok, data: { output: r.output }, error: r.ok ? null : "Build failed" };
      }

      case "rollback": {
        return gitRollback();
      }

      case "generate_quote": {
        const quoteParams = {
          customer: p.customer || p.customerName || p.customer_name,
          product: p.product || p.item,
          quantity: p.quantity != null ? Number(p.quantity) : p.qty != null ? Number(p.qty) : undefined,
        };
        return generateQuote(quoteParams);
      }

      case "close_deal": {
        const closeParams = {
          customer: p.customer || p.customerName || p.customer_name,
          order_id: p.order_id || p.orderId || p.orderID,
        };
        const closeResult = closeDeal(closeParams);
        if (!closeResult.ok) {
          return { ok: false, data: closeResult.data, error: closeResult.error };
        }

        const unitPrice = Number(p.unitPrice || p.pricePerShirt || p.price_per_item || p.unit_price || 0);
        const qty = Number(p.quantity || p.qty || 0);
        let total = Number(p.total || 0);
        if (!total && qty && unitPrice) total = qty * unitPrice;

        if (total > 0) {
          const dep =
            p.deposit !== undefined && p.deposit !== null && p.deposit !== ""
              ? Number(p.deposit)
              : Math.round(total * 0.5 * 100) / 100;
          const invResult = await createSquareInvoice({
            customerName: closeParams.customer || p.customerName || p.customer_name || "Customer",
            customerEmail: p.email || p.customerEmail || p.customer_email || null,
            title: p.title || p.product || p.item || "Custom Order",
            quantity: qty || 1,
            unitPrice: unitPrice || total,
            total,
            deposit: dep,
          });
          return {
            ok: true,
            data: { ...closeResult.data, invoice: invResult },
            error: null,
          };
        }

        return { ok: true, data: closeResult.data, error: null };
      }

      case "create_invoice": {
        const customerName = p.customer || p.customerName || "Customer";
        const customerEmail = p.email || p.customerEmail || null;
        const title = p.title || p.product || p.item || "Custom Order";
        const qty = Number(p.quantity || 1);
        const unitPrice = Number(p.unitPrice || p.total || 0);
        const total = Number(p.total || (qty * unitPrice));
        const deposit = p.deposit || Math.round(total * 0.5 * 100);

        const result = await createSquareInvoice({
          customerName,
          customerEmail,
          title,
          quantity: qty,
          unitPrice: unitPrice || total,
          total,
          deposit,
        });

        return { ok: true, data: result, error: null };
      }

      default:
        return { ok: false, data: null, error: `Unknown command: ${action}` };
    }
  } catch (err) {
    logger.error(`[COMMAND-EXECUTOR] Error executing ${action}: ${err.message}`);
    return { ok: false, data: null, error: err.message };
  }
}

module.exports = { executeCommand };
