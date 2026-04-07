/**
 * Bundle 15 — run one approved automation action (draft invoice / status / no-ops).
 * Reuses squareDraftInvoice + orderStatusEngine; mirrors payment gate from POST /orders/update-status.
 */

const { validateExecution } = require("./executionGuardService");
const { createDraftInvoice } = require("./squareDraftInvoice");
const { updateCaptureOrderStatus } = require("./orderStatusEngine");
const {
  evaluatePaymentGate,
  captureOrderToGateInput,
} = require("./paymentGateService");
const { addException } = require("./exceptionQueueService");
const {
  evaluateExceptionOverride,
  recordOverrideUse,
} = require("./exceptionOverrideService");
const { canRun } = require("./autopilotGuardService");
const { getPrisma } = require("../marketing/prisma-client");
const { recordLedgerEventSafe } = require("./actionLedgerService");

const PRODUCTION_FACING = ["READY", "PRINTING", "QC"];

/**
 * @param {unknown} raw
 * @returns {Promise<{ status: number, json: object }>}
 */
async function runAutomationExecute(raw) {
  const guard = validateExecution(raw);
  if (!guard.allowed) {
    return { status: 400, json: { success: false, error: guard.reason } };
  }

  const { actionType, orderId, customerId } = guard.normalizedAction;
  const payload =
    raw &&
    typeof raw === "object" &&
    /** @type {{ payload?: unknown }} */ (raw).payload &&
    typeof /** @type {{ payload?: object }} */ (raw).payload === "object" &&
    !Array.isArray(/** @type {{ payload?: object }} */ (raw).payload)
      ? /** @type {{ payload: Record<string, unknown> }} */ (raw).payload
      : {};

  if (actionType === "review") {
    return {
      status: 200,
      json: {
        success: true,
        actionType: "review",
        executed: false,
        result: {
          success: true,
          executed: false,
          message: "Manual review required",
        },
      },
    };
  }

  if (actionType === "followup") {
    return {
      status: 200,
      json: {
        success: true,
        actionType: "followup",
        executed: false,
        result: {
          success: true,
          executed: false,
          message: "Use script + call/email manually",
        },
      },
    };
  }

  if (actionType === "invoice") {
    /** @type {{ lineItems?: unknown, amount?: unknown, description?: unknown, customerName?: unknown }} */
    const p = payload;
    let lineItems;
    if (Array.isArray(p.lineItems) && p.lineItems.length > 0) {
      lineItems = p.lineItems.map((li) => {
        /** @type {{ name?: unknown, quantity?: unknown, price?: unknown }} */
        const x = li && typeof li === "object" ? li : {};
        return {
          name: String(x.name || "Item"),
          quantity: Math.max(1, Math.floor(Number(x.quantity) || 1)),
          price: Number(x.price),
        };
      });
    } else {
      const amt = Number(p.amount);
      const desc = String(p.description || p.customerName || "Custom order").trim() || "Custom order";
      lineItems = [{ name: desc.slice(0, 200), quantity: 1, price: amt }];
    }

    const inv = await createDraftInvoice({
      customerId,
      lineItems,
    });
    if (!inv.success) {
      return {
        status: 200,
        json: { success: false, error: inv.error || "invoice failed" },
      };
    }
    return {
      status: 200,
      json: {
        success: true,
        actionType: "invoice",
        executed: true,
        result: {
          invoiceId: inv.invoiceId || "",
          status: inv.status || "DRAFT",
        },
      },
    };
  }

  if (actionType === "production") {
    const id = String(orderId || "").trim();
    const prisma = getPrisma();
    if (!prisma || !prisma.captureOrder) {
      return {
        status: 200,
        json: { success: false, error: "Database unavailable" },
      };
    }

    const row = await prisma.captureOrder.findUnique({ where: { id } });
    if (!row) {
      return { status: 200, json: { success: false, error: "order not found" } };
    }

    const nextNorm = "PRINTING";
    const customerName = String(row.customerName || "").trim();
    let overrideApplied = false;
    /** @type {string[]} */
    const overrideBits = [];

    if (PRODUCTION_FACING.includes(nextNorm)) {
      try {
        const autoGate = canRun("production_move");
        if (!autoGate.allowed) {
          const rsn = String(autoGate.reason || "").toLowerCase();
          if (rsn.includes("kill switch")) {
            return {
              status: 200,
              json: { success: false, error: autoGate.reason },
            };
          }
          const ovrA = evaluateExceptionOverride({
            orderId: id,
            customerName,
            exceptionType: "automation",
            actionType: "automation_execute",
            reason: autoGate.reason || "",
          });
          if (!ovrA.overrideAllowed) {
            return {
              status: 200,
              json: { success: false, error: autoGate.reason },
            };
          }
          recordOverrideUse(ovrA.matchedExceptionId);
          overrideApplied = true;
          overrideBits.push("Founder approved automation exception");
        }
      } catch (_) {
        return {
          status: 200,
          json: { success: false, error: "automation guard check failed" },
        };
      }

      const gate = evaluatePaymentGate(captureOrderToGateInput(row));
      if (!gate.allowedToProduce) {
        try {
          let ovr = evaluateExceptionOverride({
            orderId: id,
            customerName,
            exceptionType: "payment",
            actionType: "production_move",
            reason: gate.reason || "",
          });
          if (!ovr.overrideAllowed) {
            ovr = evaluateExceptionOverride({
              orderId: id,
              customerName,
              exceptionType: "production",
              actionType: "production_move",
              reason: gate.reason || "",
            });
          }
          if (ovr.overrideAllowed) {
            recordOverrideUse(ovr.matchedExceptionId);
            overrideApplied = true;
            overrideBits.push("Founder approved payment/production exception");
          } else {
            addException({
              type: "payment",
              orderId: id,
              customerName,
              severity: gate.gateStatus === "blocked" ? "high" : "medium",
              reason:
                gate.reason ||
                "Automation production move blocked by payment/deposit gate",
            });
            return {
              status: 200,
              json: {
                success: false,
                error:
                  gate.reason ||
                  "Order cannot move to PRINTING until payment/deposit is confirmed",
                gateStatus: gate.gateStatus,
                flags: gate.flags,
              },
            };
          }
        } catch (_) {
          addException({
            type: "payment",
            orderId: id,
            customerName,
            severity: gate.gateStatus === "blocked" ? "high" : "medium",
            reason:
              gate.reason ||
              "Automation production move blocked by payment/deposit gate",
          });
          return {
            status: 200,
            json: {
              success: false,
              error:
                gate.reason ||
                "Order cannot move to PRINTING until payment/deposit is confirmed",
              gateStatus: gate.gateStatus,
              flags: gate.flags,
            },
          };
        }
      }
    }

    const result = await updateCaptureOrderStatus(id, "PRINTING");
    if (!result.success) {
      return {
        status: 200,
        json: { success: false, error: result.error || "status update failed" },
      };
    }
    if (overrideApplied) {
      recordLedgerEventSafe({
        type: "override",
        action: "production_automation_override_applied",
        status: "success",
        customerName,
        orderId: id,
        reason: overrideBits.join(" · "),
        meta: { actionType: "production" },
      });
    }
    return {
      status: 200,
      json: {
        success: true,
        actionType: "production",
        executed: true,
        ...(overrideApplied
          ? {
              overrideApplied: true,
              overrideReason: overrideBits.join(" · "),
            }
          : {}),
        result: { status: result.status },
      },
    };
  }

  return {
    status: 400,
    json: { success: false, error: "unsupported actionType" },
  };
}

module.exports = { runAutomationExecute };
