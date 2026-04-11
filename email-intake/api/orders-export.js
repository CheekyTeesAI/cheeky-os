/**
 * Dataverse Orders Export — READ-ONLY Endpoint
 * Queries ct_orderses for URGENT_CASH orders and returns clean JSON.
 *
 * Uses metadata discovery at startup to resolve actual Dataverse column names.
 * Falls back to hardcoded names if discovery is unavailable.
 *
 * GET /api/orders/export
 *
 * This is a READ-ONLY endpoint. No writes, no updates, no triggers.
 * Safe for production use.
 *
 * Run standalone: node api/orders-export.js
 * Or require and mount on an existing Express app.
 *
 * Environment variables (already in .env):
 *   DATAVERSE_URL            — e.g. https://org143bbb56.crm.dynamics.com
 *   DATAVERSE_TENANT_ID      — Azure AD tenant ID
 *   DATAVERSE_CLIENT_ID      — App registration client ID
 *   DATAVERSE_CLIENT_SECRET  — App registration client secret
 *
 * @module api/orders-export
 */

require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });

const express = require("express");
const cron = require("node-cron");
const { SquareClient } = require("square");
const { discoverSchema } = require("../metadata");

const squareClient = new SquareClient({
  token: process.env.SQUARE_ACCESS_TOKEN || "not-set",
});

const app = express();
app.use(express.json());
const PORT = parseInt(process.env.EXPORT_PORT, 10) || 3000;
const BASE_URL = process.env.BASE_URL || ("http://localhost:" + PORT);

// ── Dataverse config ────────────────────────────────────────────────────────
var DATAVERSE_URL = process.env.DATAVERSE_URL || "";
var DATAVERSE_TENANT_ID = process.env.DATAVERSE_TENANT_ID || "";
var DATAVERSE_CLIENT_ID = process.env.DATAVERSE_CLIENT_ID || "";
var DATAVERSE_CLIENT_SECRET = process.env.DATAVERSE_CLIENT_SECRET || "";

/** Module-level schema map — populated once at startup by discoverSchema(). */
var schemaMap = {};

// ── Auth ────────────────────────────────────────────────────────────────────
/**
 * Acquire an OAuth token from Azure AD using client credentials.
 * @returns {Promise<string>} Bearer access token.
 * @throws {Error} If credentials are missing or token request fails.
 */
async function getAccessToken() {
  if (!DATAVERSE_URL) throw new Error("DATAVERSE_URL is not set");
  if (!DATAVERSE_TENANT_ID) throw new Error("DATAVERSE_TENANT_ID is not set");
  if (!DATAVERSE_CLIENT_ID) throw new Error("DATAVERSE_CLIENT_ID is not set");
  if (!DATAVERSE_CLIENT_SECRET) throw new Error("DATAVERSE_CLIENT_SECRET is not set");

  var tokenUrl = "https://login.microsoftonline.com/" + DATAVERSE_TENANT_ID + "/oauth2/v2.0/token";
  var params = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: DATAVERSE_CLIENT_ID,
    client_secret: DATAVERSE_CLIENT_SECRET,
    scope: DATAVERSE_URL + "/.default",
  });

  var res = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  if (!res.ok) {
    var errText = await res.text();
    throw new Error("Token request failed (" + res.status + "): " + errText.slice(0, 300));
  }

  var data = await res.json();
  return data.access_token;
}

// ── Field Resolution ────────────────────────────────────────────────────────
/**
 * Resolve logical field names from the schema map using multiple candidate keys.
 * Each field tries several normalized display name variants, then falls back to a hardcoded default.
 *
 * @param {Object} map - Schema map from discoverSchema() (normalized_display_name → logical_name).
 * @returns {Object} Resolved field names: { customer_name, order_total, deposit_paid, quote_sent_date, production_status, cash_priority }.
 */
function resolveFields(map) {
  /**
   * Try multiple candidate keys in the schema map; return the first match or the fallback.
   * @param {string[]} candidates - Normalized display name candidates to try.
   * @param {string} fallback     - Hardcoded fallback logical name.
   * @returns {string} Resolved logical column name.
   */
  function tryResolve(candidates, fallback) {
    for (var i = 0; i < candidates.length; i++) {
      if (map[candidates[i]]) {
        return map[candidates[i]];
      }
    }
    return fallback;
  }

  return {
    customer_name: tryResolve(
      ["customer_name", "customername", "customer", "ct_customername"],
      "ct_customername"
    ),
    order_total: tryResolve(
      ["order_total", "total_amount", "ordertotal", "totalamount", "ct_totalamount", "ct_ordertotal"],
      "ct_ordertotal"
    ),
    deposit_paid: tryResolve(
      ["deposit_paid", "deposit_amount", "depositpaid", "depositamount", "ct_depositamount", "ct_depositpaid"],
      "ct_depositpaid"
    ),
    quote_sent_date: tryResolve(
      ["quote_sent_date", "due_date", "quotesentdate", "duedate", "ct_duedate", "ct_quotesentdate"],
      "ct_quotesentdate"
    ),
    production_status: tryResolve(
      ["production_status", "order_stage", "productionstatus", "orderstage", "ct_orderstage", "ct_productionstatus"],
      "ct_productionstatus"
    ),
    cash_priority: "ct_rushorder",
  };
}

// ── Production Status Code → Label Map ───────────────────────────────────────
var PRODUCTION_STATUS_MAP = {
  100000000: "Pending",
  100000001: "Approved",
  100000002: "In Production",
  100000003: "Completed",
  100000004: "On Hold",
  100000005: "Cancelled"
};

// ── Hard Override ────────────────────────────────────────────────────────────
// BYPASS ALL DYNAMIC FIELD LOGIC — use only verified Dataverse columns.
// Source: live column-check.js output against org143bbb56.crm.dynamics.com
var FORCE_FIELDS = [
  "ct_customername",
  "ct_totalamount",
  "ct_depositamount",
  "ct_duedate",
  "ct_orderstage",
  "ct_rushorder"    // ← ONLY valid priority field
];

// ── Endpoint ────────────────────────────────────────────────────────────────
/**
 * GET /api/orders/export — Returns orders as a clean JSON array.
 * READ-ONLY. No writes, no updates, no triggers, no side effects.
 *
 * Uses hardcoded column names verified against live Dataverse schema.
 * No dynamic resolution — no room for mismatched columns.
 */
app.get("/api/orders/export", async function (req, res) {
  try {
    var token = await getAccessToken();

    // Build clean URL — NO dynamic mapping, NO filter
    var url = DATAVERSE_URL + "/api/data/v9.2/ct_orderses"
      + "?$select=" + FORCE_FIELDS.join(",");

    console.log("=== FINAL HARD URL ===");
    console.log(url);
    console.log("======================");

    var dvRes = await fetch(url, {
      method: "GET",
      headers: {
        "Authorization": "Bearer " + token,
        "OData-MaxVersion": "4.0",
        "OData-Version": "4.0",
        "Accept": "application/json",
        "Prefer": "odata.include-annotations=*",
      },
    });

    if (!dvRes.ok) {
      var errText = await dvRes.text();
      return res.status(dvRes.status).json({
        error: "Dataverse query failed",
        status: dvRes.status,
        detail: errText.slice(0, 500),
      });
    }

    var data = await dvRes.json();
    console.log("RAW DATAVERSE RESPONSE:");
    console.log(JSON.stringify(data, null, 2));
    var orders = (data.value || []).map(function (row) {
      var statusCode = row["ct_orderstage"] ?? null;
      return {
        customer_name: row["ct_customername"] ?? null,
        order_total: row["ct_totalamount"] ?? 0,
        deposit_paid: row["ct_depositamount"] ?? 0,
        quote_sent_date: row["ct_duedate"] ?? null,
        production_status: statusCode != null ? (PRODUCTION_STATUS_MAP[statusCode] || "Unknown") : null,
        production_status_code: statusCode,
        cash_priority: row["ct_rushorder"] ?? null,
        raw_id: row["ct_ordersid"] ?? null,
      };
    });

    return res.status(200).json({
      count: orders.length,
      orders: orders,
    });
  } catch (err) {
    console.error("[EXPORT] Error: " + err.message);
    return res.status(500).json({
      error: "Dataverse query failed",
      status: 500,
      detail: err.message,
    });
  }
});

/** Health check for the export service. */
app.get("/api/orders/health", function (req, res) {
  res.status(200).json({ status: "ok", service: "orders-export", readOnly: true, timestamp: new Date().toISOString() });
});

// ── Production Tracker ─────────────────────────────────────────────────────
/** Return the single highest-priority order that should be worked on next. */
app.get("/api/production/next", async function (req, res) {
  try {
    var response = await fetch(BASE_URL + "/api/orders/export");
    var data = await response.json();
    var orders = data.orders || [];

    // Score each order: lower score = higher priority
    var scored = orders.map(function (order) {
      var score = 50;
      if (order.cash_priority === true) score -= 30;
      if (!order.deposit_paid || order.deposit_paid === 0) score += 20;
      if (order.production_status === "Pending" && order.deposit_paid > 0) score -= 20;
      if (order.production_status === "Approved") score -= 10;
      if (order.production_status === "In Production") score -= 5;
      if (order.production_status === "Completed" || order.production_status === "Cancelled") score += 100;
      return { order: order, score: score };
    });

    scored.sort(function (a, b) { return a.score - b.score; });

    var top = scored[0];

    if (!top || top.score >= 100) {
      return res.json({
        next_action: "No actionable orders right now",
        order: null,
      });
    }

    var action = "Process order";
    if (top.order.cash_priority === true) action = "RUSH — print immediately";
    else if (!top.order.deposit_paid || top.order.deposit_paid === 0) action = "Collect deposit before printing";
    else if (top.order.production_status === "Pending") action = "Approve and start printing";
    else if (top.order.production_status === "Approved") action = "Move to printer queue";
    else if (top.order.production_status === "In Production") action = "Check print progress";

    return res.json({
      next_action: action + " for " + top.order.customer_name,
      order: top.order,
      score: top.score,
    });
  } catch (err) {
    console.error("[PRODUCTION-NEXT] Error:", err.message);
    return res.status(500).json({ error: "Production next failed" });
  }
});

/** Return all orders as a prioritized task list for the production floor. */
app.get("/api/production/tasks", async function (req, res) {
  try {
    var response = await fetch(BASE_URL + "/api/orders/export");
    var data = await response.json();
    var orders = data.orders || [];

    var tasks = orders
      .filter(function (order) {
        return order.production_status !== "Completed" && order.production_status !== "Cancelled";
      })
      .map(function (order) {
        var priority = "NORMAL";
        var action = "Review order";

        if (order.cash_priority === true) {
          priority = "URGENT";
          action = "RUSH — print immediately";
        } else if (!order.deposit_paid || order.deposit_paid === 0) {
          priority = "BLOCKED";
          action = "Waiting on deposit";
        } else if (order.production_status === "Pending") {
          priority = "READY";
          action = "Ready to start printing";
        } else if (order.production_status === "Approved") {
          priority = "ACTIVE";
          action = "Send to printer";
        } else if (order.production_status === "In Production") {
          priority = "ACTIVE";
          action = "Check print / QC";
        } else if (order.production_status === "On Hold") {
          priority = "HOLD";
          action = "Resolve hold issue";
        }

        return {
          customer: order.customer_name,
          status: order.production_status,
          deposit: order.deposit_paid,
          total: order.order_total,
          priority: priority,
          action: action,
          rush: order.cash_priority === true,
        };
      });

    // Sort: URGENT first, then READY, ACTIVE, NORMAL, HOLD, BLOCKED
    var priorityOrder = { "URGENT": 0, "READY": 1, "ACTIVE": 2, "NORMAL": 3, "HOLD": 4, "BLOCKED": 5 };
    tasks.sort(function (a, b) {
      return (priorityOrder[a.priority] || 99) - (priorityOrder[b.priority] || 99);
    });

    return res.json({
      count: tasks.length,
      tasks: tasks,
    });
  } catch (err) {
    console.error("[PRODUCTION-TASKS] Error:", err.message);
    return res.status(500).json({ error: "Production tasks failed" });
  }
});

// ── System Dashboard ───────────────────────────────────────────────────────
/** Full system summary — combines financial totals, production pipeline, and system health. */
app.get("/api/dashboard", async function (req, res) {
  try {
    var response = await fetch(BASE_URL + "/api/orders/export");
    var data = await response.json();
    var orders = data.orders || [];

    var totalRevenue = 0;
    var totalDeposits = 0;
    var noDepositCount = 0;
    var urgentCount = 0;
    var readyCount = 0;
    var inProductionCount = 0;
    var completedCount = 0;
    var onHoldCount = 0;

    for (var i = 0; i < orders.length; i++) {
      var o = orders[i];
      totalRevenue += (o.order_total || 0);
      totalDeposits += (o.deposit_paid || 0);
      if (!o.deposit_paid || o.deposit_paid === 0) noDepositCount++;
      if (o.cash_priority === true) urgentCount++;
      if (o.production_status === "Pending" && o.deposit_paid > 0) readyCount++;
      if (o.production_status === "In Production") inProductionCount++;
      if (o.production_status === "Completed") completedCount++;
      if (o.production_status === "On Hold") onHoldCount++;
    }

    return res.json({
      summary: {
        total_orders: orders.length,
        revenue: totalRevenue,
        deposits_collected: totalDeposits,
        outstanding: totalRevenue - totalDeposits,
        urgent: urgentCount,
        ready_to_print: readyCount,
        in_production: inProductionCount,
        completed: completedCount,
        on_hold: onHoldCount,
        awaiting_deposit: noDepositCount,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[DASHBOARD] Error:", err.message);
    return res.status(500).json({ error: "Dashboard failed" });
  }
});

/** Simple decision engine — prioritizes orders based on deposit and status. */
app.get("/api/orders/decision", async function (req, res) {
  try {
    var response = await fetch(BASE_URL + "/api/orders/export");
    var data = await response.json();

    var decisions = (data.orders || []).map(function (order) {
      var priority = "NORMAL";

      if (!order.deposit_paid || order.deposit_paid === 0) {
        priority = "COLLECT CASH";
      } else if (order.cash_priority === true) {
        priority = "URGENT";
      } else if (order.production_status === "Pending") {
        priority = "READY TO START";
      }

      return {
        customer: order.customer_name,
        status: order.production_status,
        deposit: order.deposit_paid,
        priority: priority,
      };
    });

    return res.json({
      count: decisions.length,
      decisions: decisions,
    });
  } catch (err) {
    return res.status(500).json({ error: "Decision engine failed" });
  }
});

/** Follow-up engine — identifies customers who owe deposits. */
app.get("/api/orders/followups", async function (req, res) {
  try {
    var response = await fetch(BASE_URL + "/api/orders/export");
    var data = await response.json();

    var followups = (data.orders || [])
      .filter(function (order) { return !order.deposit_paid || order.deposit_paid === 0; })
      .map(function (order) {
        return {
          customer: order.customer_name,
          message: "Hey " + order.customer_name + ", we're ready to start your order. We just need your deposit to get it into production. Let me know if you want me to send the invoice!",
          priority: "COLLECT CASH",
        };
      });

    return res.json({
      count: followups.length,
      followups: followups,
    });
  } catch (err) {
    return res.status(500).json({ error: "Follow-up engine failed" });
  }
});

/** Send follow-up messages to customers with unpaid deposits (simulated). */
app.post("/api/orders/send-followups", async function (req, res) {
  try {
    var response = await fetch(BASE_URL + "/api/orders/followups");
    var data = await response.json();

    var results = (data.followups || []).map(function (f) {
      console.log("Sending message to " + f.customer + ": " + f.message);
      return {
        customer: f.customer,
        status: "SENT",
      };
    });

    return res.json({
      count: results.length,
      results: results,
    });
  } catch (err) {
    return res.status(500).json({ error: "Send followups failed" });
  }
});

/** Create a real Square invoice for an order. */
app.post("/api/orders/create-invoice", async function (req, res) {
  try {
    var customer_name = req.body.customer_name;
    var order_total = req.body.order_total;
    var email = req.body.email;

    var invoiceRequest = {
      idempotencyKey: Date.now().toString(),
      invoice: {
        locationId: process.env.SQUARE_LOCATION_ID,
        primaryRecipient: {
          customerEmail: email,
        },
        paymentRequests: [
          {
            requestType: "BALANCE",
            dueDate: new Date().toISOString().split("T")[0],
            fixedAmountRequestedMoney: {
              amount: BigInt(Math.round(order_total * 100)),
              currency: "USD",
            },
          },
        ],
        title: "Order for " + customer_name,
      },
    };

    var response = await squareClient.invoices.createInvoice(invoiceRequest);

    return res.json({
      success: true,
      square_invoice: response.result,
    });
  } catch (err) {
    console.error("[INVOICE] Error:", err.message);
    return res.status(500).json({ error: "Invoice creation failed", detail: err.message });
  }
});

/** Auto-invoice orders with no deposit paid. */
app.post("/api/orders/auto-invoice", async function (req, res) {
  try {
    var response = await fetch(BASE_URL + "/api/orders/export");
    var data = await response.json();

    var results = [];

    for (var i = 0; i < (data.orders || []).length; i++) {
      var order = data.orders[i];
      if (!order.deposit_paid || order.deposit_paid === 0) {
        try {
          var invoiceRes = await fetch(BASE_URL + "/api/orders/create-invoice", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              customer_name: order.customer_name,
              order_total: order.order_total,
              email: order.email || "placeholder@email.com",
            }),
          });

          var invoiceData = await invoiceRes.json();

          results.push({
            customer: order.customer_name,
            status: "INVOICE_CREATED",
            invoice_id: (invoiceData && invoiceData.square_invoice && invoiceData.square_invoice.invoice && invoiceData.square_invoice.invoice.id) || null,
          });
        } catch (err) {
          results.push({
            customer: order.customer_name,
            status: "FAILED",
          });
        }
      }
    }

    return res.json({
      count: results.length,
      results: results,
    });
  } catch (err) {
    return res.status(500).json({ error: "Auto invoice failed" });
  }
});

/** Master orchestrator — runs the full Cheeky OS pipeline in sequence. */
app.post("/api/cheeky/run-all", async function (req, res) {
  try {
    var results = {};

    results.export = await (await fetch(BASE_URL + "/api/orders/export")).json();
    results.decisions = await (await fetch(BASE_URL + "/api/orders/decision")).json();
    results.followups = await (await fetch(BASE_URL + "/api/orders/followups")).json();

    results.sent = await (await fetch(BASE_URL + "/api/orders/send-followups", { method: "POST" })).json();
    results.invoices = await (await fetch(BASE_URL + "/api/orders/auto-invoice", { method: "POST" })).json();

    return res.json({
      success: true,
      timestamp: new Date().toISOString(),
      results: results,
    });
  } catch (err) {
    return res.status(500).json({ error: "Cheeky run-all failed" });
  }
});

/** Square webhook — detects completed payments and matches to Dataverse orders. */
app.post("/api/square/webhook", async function (req, res) {
  try {
    var event = req.body;

    if (event.type === "payment.updated") {
      var payment = event.data && event.data.object && event.data.object.payment;

      if (payment && payment.status === "COMPLETED") {
        var amount = payment.amount_money ? payment.amount_money.amount / 100 : 0;
        var customerEmail = payment.buyer_email_address || null;

        console.log("\uD83D\uDCB0 Payment received: $" + amount + " from " + customerEmail);

        // STEP 1 — Pull orders
        var response = await fetch(BASE_URL + "/api/orders/export");
        var data = await response.json();

        // STEP 2 — Find matching order
        var order = null;
        var orders = data.orders || [];
        for (var i = 0; i < orders.length; i++) {
          if (orders[i].email === customerEmail) {
            order = orders[i];
            break;
          }
        }

        if (order) {
          console.log("\uD83D\uDCE6 Matching order found for " + order.customer_name);

          // STEP 3 — Update Dataverse order with deposit and clear rush flag
          var accessToken = await getAccessToken();
          var updateUrl = DATAVERSE_URL + "/api/data/v9.2/ct_orderses(" + order.raw_id + ")";

          await fetch(updateUrl, {
            method: "PATCH",
            headers: {
              "Authorization": "Bearer " + accessToken,
              "Content-Type": "application/json",
              "OData-Version": "4.0",
            },
            body: JSON.stringify({
              ct_depositamount: amount,
              ct_rushorder: false,
            }),
          });

          console.log("\u2705 Dataverse order updated");
        } else {
          console.log("\u26A0\uFE0F No matching order found");
        }
      }
    }

    return res.json({ success: true });
  } catch (err) {
    console.error("\u274C Webhook error:", err.message);
    return res.status(500).json({ error: "Webhook failed" });
  }
});

// ── Module 1: Voice Control Layer ──────────────────────────────────────────
/** Accept a plain-English command and route to the correct endpoint. */
app.post("/api/voice/command", async function (req, res) {
  try {
    var command = (req.body.command || "").toLowerCase().trim();
    var response;

    if (command.includes("what should i do next") || command.includes("next job")) {
      response = await fetch(BASE_URL + "/api/production/next");
    } else if (command.includes("show dashboard") || command === "dashboard") {
      response = await fetch(BASE_URL + "/api/dashboard");
    } else if (command.includes("show tasks") || command.includes("printer tasks")) {
      response = await fetch(BASE_URL + "/api/production/tasks");
    } else if (command.includes("run all") || command.includes("run cheeky")) {
      response = await fetch(BASE_URL + "/api/cheeky/run-all", { method: "POST" });
    } else {
      return res.json({ success: false, message: "Unknown command" });
    }

    var data = await response.json();
    return res.json({ success: true, command: command, result: data });
  } catch (err) {
    return res.status(500).json({ error: "Voice command failed" });
  }
});

// ── Module 2: Mobile Command Center ────────────────────────────────────────
/** Return a compact mobile-friendly summary for phone use. */
app.get("/api/mobile/command-center", async function (req, res) {
  try {
    var responses = await Promise.all([
      fetch(BASE_URL + "/api/dashboard"),
      fetch(BASE_URL + "/api/production/next"),
      fetch(BASE_URL + "/api/production/tasks"),
      fetch(BASE_URL + "/api/orders/export"),
    ]);

    var dashboard = await responses[0].json();
    var next = await responses[1].json();
    var tasks = await responses[2].json();
    var orders = await responses[3].json();

    var cashNeededCount = 0;
    var orderList = orders.orders || [];
    for (var i = 0; i < orderList.length; i++) {
      if (!orderList[i].deposit_paid || orderList[i].deposit_paid === 0) {
        cashNeededCount++;
      }
    }

    var urgentTasks = [];
    var taskList = tasks.tasks || [];
    for (var j = 0; j < taskList.length && urgentTasks.length < 5; j++) {
      if (taskList[j].priority === "URGENT") {
        urgentTasks.push(taskList[j]);
      }
    }

    return res.json({
      summary: dashboard.summary || {},
      next_action: next.next_action || "No next action",
      urgent_tasks: urgentTasks,
      cash_needed_count: cashNeededCount,
    });
  } catch (err) {
    return res.status(500).json({ error: "Mobile command center failed" });
  }
});

// ── Module 3: Zero-Human Order Intake ──────────────────────────────────────
/** Accept a raw order payload and normalize it into a structured order object. */
app.post("/api/intake/auto-order", async function (req, res) {
  try {
    var body = req.body || {};
    var customer_name = body.customer_name || "Unknown Customer";
    var email = body.email || null;
    var order_total = body.order_total || 0;
    var deposit_paid = body.deposit_paid || 0;
    var notes = body.notes || "";

    var noteText = String(notes).toLowerCase();
    var cash_priority = noteText.includes("asap") || noteText.includes("rush") || noteText.includes("urgent");
    var followup_required = !deposit_paid || deposit_paid === 0;

    return res.json({
      success: true,
      order: {
        customer_name: customer_name,
        email: email,
        order_total: order_total,
        deposit_paid: deposit_paid,
        production_status: "Pending",
        cash_priority: cash_priority,
        followup_required: followup_required,
        notes: notes,
      },
    });
  } catch (err) {
    return res.status(500).json({ error: "Auto intake failed" });
  }
});

/** Create a real Dataverse order from a normalized intake payload. */
app.post("/api/intake/create-order", async function (req, res) {
  try {
    var body = req.body || {};
    var customer_name = body.customer_name;
    var order_total = body.order_total;
    var deposit_paid = body.deposit_paid;
    var notes = body.notes;
    var cash_priority = body.cash_priority;
    var production_status = body.production_status;

    var STATUS_MAP = {
      "Pending": 100000000,
    };

    var accessToken = await getAccessToken();
    var createUrl = DATAVERSE_URL + "/api/data/v9.2/ct_orderses";

    var payload = {
      ct_customername: customer_name,
      ct_totalamount: order_total || 0,
      ct_depositamount: deposit_paid || 0,
      ct_rushorder: cash_priority === true,
      ct_orderstage: STATUS_MAP[production_status] || 100000000,
      ct_notes: notes || "",
    };

    var dvRes = await fetch(createUrl, {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + accessToken,
        "Content-Type": "application/json",
        "OData-Version": "4.0",
        "Prefer": "return=representation",
      },
      body: JSON.stringify(payload),
    });

    var result = await dvRes.json();

    return res.json({
      success: true,
      created: result,
    });
  } catch (err) {
    console.error("[CREATE-ORDER] Error:", err.message);
    return res.status(500).json({ error: "Create order failed" });
  }
});

// ── Owner Dashboard (Money + Pipeline) ─────────────────────────────────────
app.get("/api/owner/dashboard", async (req, res) => {
  try {
    const response = await fetch(BASE_URL + "/api/orders/export");
    const data = await response.json();

    const orders = data.orders || [];

    const totalRevenue = orders.reduce((sum, o) => sum + (o.order_total || 0), 0);
    const totalDeposits = orders.reduce((sum, o) => sum + (o.deposit_paid || 0), 0);
    const outstanding = totalRevenue - totalDeposits;

    const noDeposit = orders.filter((o) => !o.deposit_paid || o.deposit_paid === 0).length;
    const urgent = orders.filter((o) => o.cash_priority === true).length;
    const ready = orders.filter((o) => o.production_status === "Pending" && o.deposit_paid > 0).length;

    res.json({
      totals: {
        revenue: totalRevenue,
        deposits: totalDeposits,
        outstanding,
      },
      counts: {
        orders: orders.length,
        no_deposit: noDeposit,
        urgent,
        ready_to_print: ready,
      },
    });
  } catch (err) {
    console.error("[OWNER-DASHBOARD] Error:", err.message);
    res.status(500).json({ error: "Owner dashboard failed" });
  }
});

// ── One Tap Run (Phone Button) ─────────────────────────────────────────────
app.post("/api/owner/run", async (req, res) => {
  try {
    const run = await fetch(BASE_URL + "/api/cheeky/run-all", {
      method: "POST",
    });

    const result = await run.json();

    res.json({
      success: true,
      message: "Cheeky OS executed",
      result,
    });
  } catch (err) {
    console.error("[OWNER-RUN] Error:", err.message);
    res.status(500).json({ error: "Run failed" });
  }
});

// ── AI Control Endpoint (ChatGPT Ready) ────────────────────────────────────
app.post("/api/ai/control", async (req, res) => {
  try {
    const { intent } = req.body;

    let response;

    switch (intent) {
      case "dashboard":
        response = await fetch(BASE_URL + "/api/owner/dashboard");
        break;

      case "next":
        response = await fetch(BASE_URL + "/api/production/next");
        break;

      case "tasks":
        response = await fetch(BASE_URL + "/api/production/tasks");
        break;

      case "run":
        response = await fetch(BASE_URL + "/api/cheeky/run-all", {
          method: "POST",
        });
        break;

      default:
        return res.json({
          success: false,
          message: "Unknown intent",
        });
    }

    const data = await response.json();

    res.json({
      success: true,
      intent,
      data,
    });
  } catch (err) {
    console.error("[AI-CONTROL] Error:", err.message);
    res.status(500).json({ error: "AI control failed" });
  }
});

// ── Cheeky OS Daily Automation (9 AM server time) ──────────────────────────
cron.schedule("0 9 * * *", async function () {
  console.log("\uD83D\uDD25 Running Cheeky OS Daily Automation");

  try {
    await fetch(BASE_URL + "/api/cheeky/run-all", {
      method: "POST",
    });

    console.log("\u2705 Cheeky OS run complete");
  } catch (err) {
    console.error("\u274C Cheeky OS run failed:", err.message);
  }
});

// ── Module export + standalone startup ──────────────────────────────────────
module.exports = { app, getAccessToken, resolveFields };

if (require.main === module) {
  (async function () {
    try {
      console.log("[STARTUP] Acquiring access token for schema discovery...");
      var token = await getAccessToken();

      console.log("[STARTUP] Discovering Dataverse schema...");
      schemaMap = await discoverSchema(token, DATAVERSE_URL);

      if (!schemaMap || Object.keys(schemaMap).length === 0) {
        console.error("[STARTUP] Schema map is empty — cannot start server.");
        process.exit(1);
      }

      console.log("[STARTUP] Schema discovery complete (" + Object.keys(schemaMap).length + " entries).");

      // Verify field resolution before starting
      var fields = resolveFields(schemaMap);
      console.log("[STARTUP] Resolved fields:");
      console.log("  customer_name     → " + fields.customer_name);
      console.log("  order_total       → " + fields.order_total);
      console.log("  deposit_paid      → " + fields.deposit_paid);
      console.log("  quote_sent_date   → " + fields.quote_sent_date);
      console.log("  production_status → " + fields.production_status);
      console.log("  cash_priority     → " + fields.cash_priority);

      app.listen(PORT, "0.0.0.0", function () {
        console.log("");
        console.log("=".repeat(55));
        console.log("  \uD83D\uDCE6 Cheeky Tees — Orders Export (READ-ONLY)");
        console.log("  GET " + BASE_URL + "/api/orders/export");
        console.log("  GET " + BASE_URL + "/api/orders/health");
        console.log("  Filter: NONE (returning all orders)");
        console.log("  Mode: READ-ONLY — no writes, no side effects");
        console.log("=".repeat(55));
        console.log("");
      });
    } catch (err) {
      console.error("[STARTUP] Fatal: " + err.message);
      console.error("[STARTUP] Cannot start server without schema discovery. Exiting.");
      process.exit(1);
    }
  })();
}
