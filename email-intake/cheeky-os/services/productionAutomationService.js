/**
 * Bundle 27 — safe one-step production transitions (rules only, no I/O).
 */

/** Adjacent forward step only — must match orderStatusEngine.ORDER_STATUSES. */
const NEXT_STATUS = {
  DEPOSIT: "READY",
  READY: "PRINTING",
  PRINTING: "QC",
  QC: "DONE",
};

/**
 * @param {{ paymentStatus?: string, depositReceived?: unknown }} input
 * @returns {boolean}
 */
function paymentConfirmed(input) {
  const ps = String((input && input.paymentStatus) || "")
    .trim()
    .toLowerCase();
  if (ps === "paid") return true;
  return input && input.depositReceived === true;
}

/**
 * @param {unknown[]} tasks
 * @param {(t: { title?: string, status?: string }) => boolean} titlePredicate
 */
function hasCompletedTask(tasks, titlePredicate) {
  const list = Array.isArray(tasks) ? tasks : [];
  for (const t of list) {
    if (!t || typeof t !== "object") continue;
    const st = String(t.status || "")
      .trim()
      .toLowerCase();
    if (st !== "done" && st !== "complete" && st !== "completed")
      continue;
    if (titlePredicate(/** @type {{title?:string,status?:string}} */ (t)))
      return true;
  }
  return false;
}

/**
 * @param {unknown[]} tasks
 */
function isPrintTaskComplete(tasks) {
  return hasCompletedTask(tasks, (t) => {
    const title = String(t.title || "").toLowerCase();
    return (
      title === "print" ||
      (title.includes("print") && !title.includes("quality"))
    );
  });
}

/**
 * @param {unknown[]} tasks
 */
function isQcTaskComplete(tasks) {
  return hasCompletedTask(tasks, (t) => {
    const title = String(t.title || "").toLowerCase();
    return title.includes("quality");
  });
}

/**
 * @param {{
 *   orderId?: string,
 *   status?: string,
 *   paymentStatus?: string,
 *   depositReceived?: unknown,
 *   tasks?: unknown,
 *   riskLevel?: string,
 *   priority?: string
 * }} input
 * @returns {{ nextStatus: string, shouldAdvance: boolean, reason: string }}
 */
function evaluateProductionAutomation(input) {
  const status = String((input && input.status) || "")
    .trim()
    .toUpperCase();
  const risk = String((input && input.riskLevel) || "")
    .trim()
    .toLowerCase();
  const tasks = input && input.tasks;

  if (risk === "high") {
    return {
      nextStatus: "",
      shouldAdvance: false,
      reason: "high_risk_blocked",
    };
  }

  const next = NEXT_STATUS[status];
  if (!next) {
    return {
      nextStatus: "",
      shouldAdvance: false,
      reason: "stage_not_auto_advanced",
    };
  }

  if (status === "DEPOSIT") {
    if (!paymentConfirmed(input)) {
      return {
        nextStatus: "",
        shouldAdvance: false,
        reason: "payment_not_confirmed",
      };
    }
    return {
      nextStatus: "READY",
      shouldAdvance: true,
      reason: "deposit_cleared_to_ready",
    };
  }

  if (status === "READY") {
    if (!paymentConfirmed(input)) {
      return {
        nextStatus: "",
        shouldAdvance: false,
        reason: "payment_not_cleared",
      };
    }
    return {
      nextStatus: "PRINTING",
      shouldAdvance: true,
      reason: "ready_to_printing",
    };
  }

  if (status === "PRINTING") {
    if (!isPrintTaskComplete(tasks)) {
      return {
        nextStatus: "",
        shouldAdvance: false,
        reason: "print_task_not_complete",
      };
    }
    return {
      nextStatus: "QC",
      shouldAdvance: true,
      reason: "print_complete_to_qc",
    };
  }

  if (status === "QC") {
    if (!isQcTaskComplete(tasks)) {
      return {
        nextStatus: "",
        shouldAdvance: false,
        reason: "qc_task_not_complete",
      };
    }
    return {
      nextStatus: "DONE",
      shouldAdvance: true,
      reason: "qc_complete_to_done",
    };
  }

  return {
    nextStatus: "",
    shouldAdvance: false,
    reason: "unknown_stage",
  };
}

module.exports = {
  evaluateProductionAutomation,
  NEXT_STATUS,
};
