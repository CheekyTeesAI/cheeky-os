/**
 * Bundle 27 — advance capture orders one safe step (mirrors POST /orders/update-status gating).
 */

const { getPrisma } = require("../marketing/prisma-client");
const { evaluateProductionAutomation } = require("./productionAutomationService");
const { updateCaptureOrderStatus } = require("./orderStatusEngine");
const {
  evaluatePaymentGate,
  captureOrderToGateInput,
} = require("./paymentGateService");
const { getMemory } = require("./orderMemoryService");
const { analyzeJob } = require("./jobIntelligenceService");
const { canRun } = require("./autopilotGuardService");
const { addException } = require("./exceptionQueueService");
const { recordLedgerEventSafe } = require("./actionLedgerService");

const PRODUCTION_FACING = ["READY", "PRINTING", "QC"];

const MAX_ORDERS_SCAN = 20;
const MAX_ADVANCES_PER_RUN = 5;
const STOP_AFTER_CONSECUTIVE_ERRORS = 2;

/**
 * Same gate as routes/ordersStatus.js before production-facing targets.
 * @param {string} nextNorm
 * @param {object} row
 */
function gateAllowsProduction(nextNorm, row) {
  const u = String(nextNorm || "").toUpperCase();
  if (!PRODUCTION_FACING.includes(u)) {
    return { ok: true, reason: "" };
  }
  const gate = evaluatePaymentGate(captureOrderToGateInput(row));
  if (!gate.allowedToProduce) {
    return { ok: false, reason: gate.reason || "payment_gate_blocked" };
  }
  return { ok: true, reason: "" };
}

/**
 * @returns {Promise<{ advanced: number, skipped: number, errors: string[] }>}
 */
async function runProductionExecutor() {
  const out = { advanced: 0, skipped: 0, errors: [] };
  const gate = canRun("production_move");
  if (!gate.allowed) {
    out.errors.push(gate.reason);
    console.warn("[productionExecutor] blocked:", gate.reason);
    const r = String(gate.reason || "").toLowerCase();
    addException({
      type: "automation",
      customerName: "",
      orderId: "",
      severity: r.includes("kill switch") ? "critical" : "high",
      reason: `Production automation blocked: ${gate.reason}`,
    });
    recordLedgerEventSafe({
      type: "production",
      action: "production_executor_blocked",
      status: "blocked",
      reason: String(gate.reason || "autopilot blocked"),
    });
    return out;
  }
  let consecutiveErrors = 0;

  const prisma = getPrisma();
  if (!prisma || !prisma.captureOrder) {
    out.errors.push("database_not_available");
    recordLedgerEventSafe({
      type: "production",
      action: "production_executor_blocked",
      status: "blocked",
      reason: "database_not_available",
    });
    return out;
  }

  try {
    const rows = await prisma.captureOrder.findMany({
      where: {
        status: { in: ["DEPOSIT", "READY", "PRINTING", "QC"] },
      },
      include: { tasks: true },
      orderBy: { createdAt: "asc" },
      take: MAX_ORDERS_SCAN,
    });

    for (const row of rows) {
      if (out.advanced >= MAX_ADVANCES_PER_RUN) break;
      if (consecutiveErrors >= STOP_AFTER_CONSECUTIVE_ERRORS) break;

      const memory = getMemory(row);
      const intel = analyzeJob({
        customerName: row.customerName,
        quantity: row.quantity,
        product: row.product,
        printType: row.printType,
        dueText: row.dueDate,
        status: row.status,
        paymentStatus: row.paymentStatus,
        memory,
      });
      const riskLevel = intel.risk && intel.risk.level ? intel.risk.level : "low";

      const decision = evaluateProductionAutomation({
        orderId: row.id,
        status: row.status,
        paymentStatus: row.paymentStatus,
        depositReceived: row.depositReceived,
        tasks: row.tasks,
        riskLevel,
        priority: "",
      });

      if (!decision.shouldAdvance || !decision.nextStatus) {
        out.skipped++;
        continue;
      }

      const gate = gateAllowsProduction(decision.nextStatus, row);
      if (!gate.ok) {
        out.skipped++;
        recordLedgerEventSafe({
          type: "production",
          action: "production_advance_skipped",
          status: "skipped",
          customerName: row.customerName,
          orderId: row.id,
          reason: String(gate.reason || "payment_gate"),
        });
        continue;
      }

      const result = await updateCaptureOrderStatus(
        row.id,
        decision.nextStatus
      );
      if (!result.success) {
        out.errors.push(
          `${row.id}: ${result.error || "update_failed"}`
        );
        consecutiveErrors++;
        recordLedgerEventSafe({
          type: "production",
          action: "production_advance_failed",
          status: "blocked",
          customerName: row.customerName,
          orderId: row.id,
          reason: String(result.error || "update_failed"),
        });
        continue;
      }

      consecutiveErrors = 0;
      out.advanced++;
      recordLedgerEventSafe({
        type: "production",
        action: "production_order_advanced",
        status: "success",
        customerName: row.customerName,
        orderId: row.id,
        reason: String(decision.reason || ""),
        meta: { from: row.status, to: result.status },
      });
      console.log("[productionExecutor] advanced", {
        orderId: row.id,
        from: row.status,
        to: result.status,
        reason: decision.reason,
      });
    }
  } catch (err) {
    const msg = String(err && err.message ? err.message : err);
    out.errors.push(msg);
    recordLedgerEventSafe({
      type: "production",
      action: "production_executor_error",
      status: "blocked",
      reason: msg,
    });
  }

  return out;
}

module.exports = {
  runProductionExecutor,
  MAX_ADVANCES_PER_RUN,
  MAX_ORDERS_SCAN,
};
