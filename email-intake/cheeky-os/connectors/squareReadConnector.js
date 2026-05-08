"use strict";

/**
 * Square read-only helpers — delegates to integrations/square + fetchSafeTransientRetry.
 * No invoices created, payments captured, refunds, or customer edits.
 */

const square = require("../integrations/square");

const { fetchSafeTransientRetry } = require("../services/cheekyOsHttpRetry.service");

const fs = require("fs");
const path = require("path");

const taskQueue = require("../agent/taskQueue");

function auditSquare(operation, meta) {
  try {
    taskQueue.ensureDirAndFiles();
    const file = path.join(taskQueue.DATA_DIR, "square-read-audit.jsonl");
    fs.appendFileSync(
      file,
      `${JSON.stringify(
        Object.assign({}, meta || {}, {
          operation: String(operation || "square_read"),
          at: new Date().toISOString(),
          readOnly: true,
        })
      )}\n`,
      "utf8"
    );
  } catch (_e) {}
}

function markSquareLatency(ms, ok) {
  try {
    require("../diagnostics/metricsCollector").noteConnectorLatency("square", ms, !!ok);
  } catch (_e) {}
}

function isoDaysAgo(d) {

  try {

    const n = Number(d);

    const days = Number.isFinite(n) && n > 0 ? n : 7;

    return new Date(Date.now() - days * 86400000).toISOString();

  } catch (_e) {


    return new Date(Date.now() - 7 * 86400000).toISOString();

  }

}

async function readiness() {


  try {

      await square.initializeSquareIntegration();


      const st = square.getSquareIntegrationStatus();

      const cfg = square.getSquareRuntimeConfig();


      const loc = st.location && st.location.id;


      const token = !!(cfg.token && cfg.token.trim());


      return {


        authVerified: !!st.status && String(st.status).includes("READY"),


        locationId: loc || null,

        hasToken: token,

        error: st.error || null,


      };

    } catch (e) {

      return {


        authVerified: false,

        locationId: null,

        hasToken: false,

        error: e.message || String(e),

      };


    }


}

async function isConfigured() {


  try {


    const r = await readiness();


    return !!(r.authVerified && r.locationId);


  } catch (_e) {


    return false;


  }


}



/** synchronous surface for routes */

function isConfiguredSync() {


  try {

      const cfg = square.getSquareRuntimeConfig();

      return !!(cfg.token && cfg.token.trim());

    } catch (_e) {


      return !!(process.env.SQUARE_ACCESS_TOKEN || "").trim();

    }

}

async function getHeaders() {


  await square.initializeSquareIntegration();

  const cfg = square.getSquareRuntimeConfig();

  if (!cfg.token) return null;

  return {

    Authorization: `Bearer ${cfg.token}`,


    "Content-Type": "application/json",


    "Square-Version": "2025-05-21",

  };


}

async function listInvoices(limit) {


  const tStart = Date.now();

  try {

      await square.initializeSquareIntegration();

      const st = square.getSquareIntegrationStatus();

      const loc = st.location && st.location.id;

      if (!loc) {
        markSquareLatency(Date.now() - tStart, false);
        return { ok: false, error: square.getSquareIntegrationStatus().error || "no_location", invoices: [] };
      }

      const hdrs = await getHeaders();

      if (!hdrs) {
        markSquareLatency(Date.now() - tStart, false);
        return { ok: false, error: "no_token", invoices: [] };
      }

      const lim = Math.min(100, Math.max(1, Number(limit) || 50));

      const base = square.getBaseUrl();

      const body = {


        query: {


          filter: { location_ids: [loc] },


          sort: { field: "INVOICE_SORT_CREATED_AT", order: "DESC" },


        },


        limit: lim,


      };

      const r = await fetchSafeTransientRetry(


        `${base}/invoices/search`,


        { method: "POST", headers: hdrs, body: JSON.stringify(body), timeoutMs: 45000 },


        { label: "square:invoice-search-readonly" }

      );

      if (!r.ok || !r.data) {
        markSquareLatency(Date.now() - tStart, false);
        return {
          ok: false,

          error: r.error || "invoice_search_failed",

          invoices: [],
        };
      }

      const raw = r.data && (r.data.invoices || r.data.invoice);

      const list = Array.isArray(raw) ? raw : raw && typeof raw === "object" ? [raw] : [];

      auditSquare("listInvoices", { count: list.length });

      markSquareLatency(Date.now() - tStart, true);

      return { ok: true, invoices: list };
    } catch (e) {
      markSquareLatency(Date.now() - tStart, false);
      return { ok: false, error: e.message || String(e), invoices: [] };
    }
}

/** Unpaid / balance-due style invoices (best-effort from published invoice payload). */

async function findUnpaidInvoices() {


  try {

      const pack = await listInvoices(100);

      if (!pack.ok) return { ok: false, error: pack.error || "load_failed", items: [] };

      /** @type {object[]} */

      const out = [];

      pack.invoices.forEach((inv) => {

        try {

            const st = String(inv.status || "").toUpperCase();

            if (st === "PAID" || st === "CANCELED") return;

            const payReqs = Array.isArray(inv.payment_requests) ? inv.payment_requests : [];

            let dueCents = 0;

            payReqs.forEach((pr) => {

              try {

                  const amt =


                    pr && pr.computed_amount_money && typeof pr.computed_amount_money.amount === "number"


                      ? pr.computed_amount_money.amount


                      : 0;


                  /** Square uses minor units */


                  dueCents += amt > 0 ? amt : 0;

                } catch (_ePr) {}

            });

            if (st !== "PAID" && dueCents > 0) {

              out.push({


                invoiceId: inv.id || inv.invoice_id,


                status: inv.status,


                title: inv.title || inv.primary_recipient && inv.primary_recipient.email_address,

                computedDueCents: dueCents,


              });

            } else if (st === "UNPAID" || st === "PAYMENT_PENDING" || st === "PARTIALLY_PAID") {




              out.push({


                invoiceId: inv.id || inv.invoice_id,


                status: inv.status,


                title: inv.title,


              });

            }

          } catch (_eI) {}

      });

      auditSquare("findUnpaidInvoices", { count: out.length });

      return { ok: true, items: out };

    } catch (e) {

      return { ok: false, error: e.message || String(e), items: [] };

    }

}

async function listRecentPayments(days) {


  const tStart = Date.now();

  try {

      const hdrs = await getHeaders();


      if (!hdrs) {
        markSquareLatency(Date.now() - tStart, false);
        return { ok: false, error: "no_token", payments: [] };
      }


      const base = square.getBaseUrl();

      const begin = encodeURIComponent(isoDaysAgo(Number(days) || 7));

      const r = await fetchSafeTransientRetry(


        `${base}/payments?limit=100&sort_order=DESC&begin_time=${begin}`,


        { method: "GET", headers: hdrs, timeoutMs: 45000 },


        { label: "square:payments-readonly" }

      );

      if (!r.ok) {
        markSquareLatency(Date.now() - tStart, false);
        return { ok: false, error: r.error || "payments_failed", payments: [] };
      }


      const list = r.data && r.data.payments ? r.data.payments : [];

      auditSquare("listRecentPayments", { count: (Array.isArray(list) ? list : []).length });

      markSquareLatency(Date.now() - tStart, true);

      return { ok: true, payments: Array.isArray(list) ? list : [] };

    } catch (e) {

      markSquareLatency(Date.now() - tStart, false);
      return { ok: false, error: e.message || String(e), payments: [] };

    }

}

async function getRevenueSnapshot(days) {


  try {

      const pay = await listRecentPayments(days);

      if (!pay.ok) return { ok: false, error: pay.error || "no_payments", totalUsd: 0, count: 0 };

      let cents = 0;

      pay.payments.forEach((p) => {

        try {

            const st = String(p.status || "").toUpperCase();

            if (st !== "COMPLETED" && st !== "APPROVED") return;

            const a =


              p.amount_money && typeof p.amount_money.amount === "number" ? Math.abs(p.amount_money.amount) : 0;


            cents += a;

          } catch (_e) {}

      });

      return {

        ok: true,

        windowDays: Number(days) || 7,

        paymentCount: pay.payments.length,

        totalUsd: Math.round((cents / 100) * 100) / 100,

      };

    } catch (e) {

      return { ok: false, error: e.message || String(e), totalUsd: 0, count: 0 };

    }

}

/** Square customer fuzzy search */


async function searchCustomers(query) {


  const tStart = Date.now();

  try {




      const q = String(query || "").trim();

      if (!q) return { ok: false, error: "empty_query", customers: [] };

      const hdrs = await getHeaders();


      if (!hdrs) {
        markSquareLatency(Date.now() - tStart, false);
        return { ok: false, error: "no_token", customers: [] };
      }


      const base = square.getBaseUrl();

      /** Try email exact when looks like email */





      /** @type {object} */


      let filter = {


        fuzzy: {


          fuzzy: q,


          attribute: "EMAIL_ADDRESS",

        },



      };


      if (q.includes("@")) {






        filter = {

          email_address: {

            fuzzy: q.toLowerCase(),


          },

        };

      }

      const body = {

        query: { filter },

        limit: 10,

      };

      const r = await fetchSafeTransientRetry(

        `${base}/customers/search`,

        {


          method: "POST",



          headers: hdrs,

          body: JSON.stringify(body),

          timeoutMs: 45000,

        },

        { label: "square:customers-search-readonly" }

      );

      if (!r.ok) {

        /** Some API versions dislike fuzzy subset — degrade gracefully */


        const r2 = await fetchSafeTransientRetry(


          `${base}/customers/search`,


          {

            method: "POST",



            headers: hdrs,

            body: JSON.stringify({



              query: {



                fuzzy: {


                  fuzzy: q,


                  attribute: "GIVEN_NAME",


                },



              },

              limit: 10,

            }),

            timeoutMs: 45000,

          },

          { label: "square:customers-search-readonly-alt" }


        );


        if (!r2.ok) {

          markSquareLatency(Date.now() - tStart, false);
          return { ok: false, error: r2.error || "customer_search_failed", customers: [] };

        }

        const c2 = r2.data && r2.data.customers ? r2.data.customers : [];

        auditSquare("searchCustomers", { count: c2.length, mode: "alt" });

        markSquareLatency(Date.now() - tStart, true);
        return { ok: true, customers: Array.isArray(c2) ? c2 : [] };

      }


      const cust = r.data && r.data.customers ? r.data.customers : [];

      auditSquare("searchCustomers", { count: cust.length, mode: "primary" });

      markSquareLatency(Date.now() - tStart, true);

      return { ok: true, customers: Array.isArray(cust) ? cust : [] };

    } catch (e) {

      markSquareLatency(Date.now() - tStart, false);
      return { ok: false, error: e.message || String(e), customers: [] };


    }


}

function filterStaleOpenEstimate(order) {
  try {
    const cutoffMs = Date.now() - 5 * 86400000;
    const raw = order && (order.created_at || order.updated_at);
    const t = raw ? new Date(String(raw)).getTime() : NaN;
    return Number.isFinite(t) && t <= cutoffMs;
  } catch (_e) {
    return false;
  }
}

/** Stale OPEN orders proxy for “estimate follow-ups” */

async function getEstimateFollowups() {


  const tStart = Date.now();

  try {

      await square.initializeSquareIntegration();


      const st = square.getSquareIntegrationStatus();


      const loc = st.location && st.location.id;


      if (!loc) {
        markSquareLatency(Date.now() - tStart, false);
        return { ok: false, error: "no_location", staleOpenOrders: [] };
      }

      const hdrs = await getHeaders();


      if (!hdrs) {
        markSquareLatency(Date.now() - tStart, false);
        return { ok: false, error: "no_token", staleOpenOrders: [] };
      }

      const base = square.getBaseUrl();


      const body = {


        query: {


          filter: {

            state_filter: {


              states: ["OPEN"],



            },

          },

          sort: {

            sort_field: "CREATED_AT",

            sort_order: "DESC",

          },

        },

        location_ids: [loc],

        limit: 50,

      };

      const r = await fetchSafeTransientRetry(


        `${base}/orders/search`,


        {


          method: "POST",


          headers: hdrs,


          body: JSON.stringify(body),

          timeoutMs: 55000,

        },

        { label: "square:orders-search-readonly" }

      );

      if (!r.ok) {


        /** payload shape differs — try envelope without nesting duplicate */


        const rAlt = await fetchSafeTransientRetry(


          `${base}/orders/search`,


          {

            method: "POST",

            headers: hdrs,

            body: JSON.stringify({
              query: body.query,

              location_ids: [loc],

              limit: 40,

            }),

            timeoutMs: 55000,

          },

          { label: "square:orders-search-readonly-alt" }

        );


        if (!rAlt.ok) {
          markSquareLatency(Date.now() - tStart, false);
          return { ok: false, error: rAlt.error || r.error || "orders_search_failed", staleOpenOrders: [] };
        }

        const o2 = rAlt.data && rAlt.data.orders ? rAlt.data.orders : [];

        const listAlt = Array.isArray(o2) ? o2 : [];

        const staleAlt = listAlt.filter(filterStaleOpenEstimate);

        auditSquare("getEstimateFollowups", { count: staleAlt.length, mode: "alt" });

        markSquareLatency(Date.now() - tStart, true);

        return { ok: true, staleOpenOrders: staleAlt.slice(0, 80) };


      }


      const orders = r.data && r.data.orders ? r.data.orders : [];

      const list = Array.isArray(orders) ? orders : [];

      const stale = list.filter(filterStaleOpenEstimate);

      auditSquare("getEstimateFollowups", { count: stale.length, mode: "primary" });

      markSquareLatency(Date.now() - tStart, true);

      return {


        ok: true,


        staleOpenOrders: stale.slice(0, 80),

      };


    } catch (e) {

      markSquareLatency(Date.now() - tStart, false);
      return {


        ok: false,

        error: e.message || String(e),

        staleOpenOrders: [],

      };


    }


}





module.exports = {


  readiness,


  isConfiguredSync,


  isConfigured,

  listInvoices,


  findUnpaidInvoices,


  listRecentPayments,

  getRevenueSnapshot,

  searchCustomers,

  getEstimateFollowups,

};
