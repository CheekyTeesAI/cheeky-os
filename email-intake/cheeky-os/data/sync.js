/**
 * Cheeky OS — Data sync helpers.
 * High-level operations that coordinate across the data layer.
 *
 * @module cheeky-os/data/sync
 */

const { store, getMode } = require("./provider");
const { logger } = require("../utils/logger");

/**
 * Track an invoice as a deal in the data layer.
 * Upserts the customer, creates/updates the deal, and logs an event.
 *
 * @param {{ customerName: string, customerEmail: string, invoiceId: string, total: number, deposit: number, notes: string }} payload
 * @returns {Promise<{ ok: boolean, data: object, error: string|null }>}
 */
async function trackInvoiceAsDeal(payload) {
  try {
    const now = new Date().toISOString();

    // Upsert customer
    let customer = null;
    if (payload.customerEmail) {
      customer = await store.findCustomerByEmail(payload.customerEmail);
    }
    if (!customer && payload.customerName) {
      customer = await store.findCustomerByName(payload.customerName);
    }
    if (!customer) {
      customer = await store.saveCustomer({
        name: payload.customerName || "Customer",
        email: payload.customerEmail || null,
        phone: null,
        company: null,
      });
    }

    // Create or update deal
    let deal = null;
    if (payload.invoiceId) {
      deal = await store.findDealByInvoiceId(payload.invoiceId);
    }

    const dealData = {
      id: deal?.id || Date.now().toString(),
      customerId: customer?.id || null,
      customerName: payload.customerName || "Customer",
      customerEmail: payload.customerEmail || null,
      invoiceId: payload.invoiceId || "inv-" + Date.now(),
      total: payload.total || 0,
      deposit: payload.deposit || 0,
      status: deal?.status || "draft",
      stage: deal?.stage || "invoiced",
      lastContactAt: now,
      notes: payload.notes || "",
    };

    const savedDeal = await store.saveDeal(dealData);

    // Log event
    await store.saveEvent({
      type: "invoice_created",
      entityType: "deal",
      entityId: savedDeal.id,
      message: `Invoice tracked for ${payload.customerName}: $${payload.total}`,
      value: { invoiceId: payload.invoiceId, total: payload.total },
    });

    logger.info(`[DATA-SYNC] trackInvoiceAsDeal: ${payload.customerName} — $${payload.total}`);
    return { ok: true, data: { customer, deal: savedDeal }, error: null };
  } catch (err) {
    logger.error(`[DATA-SYNC] trackInvoiceAsDeal error: ${err.message}`);
    return { ok: false, data: null, error: err.message };
  }
}

/**
 * Mark a deal as paid by invoiceId.
 * Updates the deal, creates a payment record, and logs an event.
 *
 * @param {{ invoiceId: string, amount: number, status: string }} payload
 * @returns {Promise<{ ok: boolean, data: object, error: string|null }>}
 */
async function markDealPaid(payload) {
  try {
    const now = new Date().toISOString();

    const deal = await store.findDealByInvoiceId(payload.invoiceId);
    if (!deal) {
      return { ok: false, data: null, error: `No deal found for invoiceId ${payload.invoiceId}` };
    }

    // Update deal
    const updated = await store.updateDeal(deal.id, {
      status: "paid",
      stage: "closed",
      paidAt: now,
    });

    // Create payment record
    const payment = await store.savePayment({
      dealId: deal.id,
      invoiceId: payload.invoiceId,
      amount: payload.amount || deal.total || 0,
      status: payload.status || "paid",
      paidAt: now,
    });

    // Log event
    await store.saveEvent({
      type: "payment_received",
      entityType: "deal",
      entityId: deal.id,
      message: `Payment received for ${deal.customerName}: $${payload.amount || deal.total}`,
      value: { invoiceId: payload.invoiceId, amount: payload.amount || deal.total },
    });

    logger.info(`[DATA-SYNC] markDealPaid: ${deal.customerName} (${payload.invoiceId})`);
    return { ok: true, data: { deal: updated, payment }, error: null };
  } catch (err) {
    logger.error(`[DATA-SYNC] markDealPaid error: ${err.message}`);
    return { ok: false, data: null, error: err.message };
  }
}

/**
 * Get a business snapshot — summary of deals, payments, and recent events.
 *
 * @returns {Promise<{ ok: boolean, data: object, error: string|null }>}
 */
async function getBusinessSnapshot() {
  try {
    const mode = getMode();
    const allDeals = await store.getDeals();
    const openDeals = await store.getOpenDeals();
    const paidDeals = allDeals.filter((d) => d.status === "paid");
    const allPayments = await store.getPayments();
    const events = await store.getEvents();

    const totalOutstanding = openDeals.reduce((sum, d) => sum + (d.total || 0), 0);
    const totalCollected = allPayments.reduce((sum, p) => sum + (p.amount || 0), 0);
    const recentEvents = events.slice(-20).reverse();

    return {
      ok: true,
      data: {
        mode,
        openDeals: openDeals.length,
        paidDeals: paidDeals.length,
        totalOutstanding: Math.round(totalOutstanding * 100) / 100,
        totalCollected: Math.round(totalCollected * 100) / 100,
        recentEvents,
      },
      error: null,
    };
  } catch (err) {
    logger.error(`[DATA-SYNC] getBusinessSnapshot error: ${err.message}`);
    return { ok: false, data: null, error: err.message };
  }
}

module.exports = {
  trackInvoiceAsDeal,
  markDealPaid,
  getBusinessSnapshot,
};
