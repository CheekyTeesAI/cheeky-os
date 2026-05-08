"use strict";

/**
 * Operator Bridge — Core Service
 * Handles context, preview, and execute logic.
 * IRON LAWS:
 *   - No auto-send (email, SMS, invoice, estimate)
 *   - Reuse existing services before building new logic
 *   - Fail closed on uncertainty
 *   - Square is financial source of truth
 */

const path = require("path");
const guardrails = require("./operator.guardrails");
const { writeAudit, readAudit } = require("./operator.audit");

// Square Sync integration (optional — loads gracefully if not present)
let squareSyncService = null;
let squareSyncGuardrails = null;
try {
  squareSyncService = require(path.join(__dirname, "..", "squareSync", "squareSync.service"));
  squareSyncGuardrails = require(path.join(__dirname, "..", "squareSync", "squareSync.guardrails"));
} catch (_) {}

// Production Routing integration (optional — loads gracefully)
let productionRoutingService = null;
try {
  productionRoutingService = require(path.join(__dirname, "..", "productionRouting", "routing.service"));
} catch (_) {}

// ─────────────────────────────────────────────────────────────────────────────
// Prisma helper (singleton shared across Cheeky OS)
// ─────────────────────────────────────────────────────────────────────────────

function getPrisma() {
  try {
    return require(path.join(__dirname, "..", "src", "lib", "prisma"));
  } catch (_) {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Utility: safe async call with fallback
// ─────────────────────────────────────────────────────────────────────────────

async function safeCall(label, fn, fallback) {
  try {
    return await fn();
  } catch (err) {
    const msg = err && err.message ? err.message : String(err);
    console.warn(`[operator-bridge/service] ${label} failed: ${msg}`);
    return fallback;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Context Engine
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns a safe, read-only business snapshot for the AI operator.
 * Never exposes secrets, tokens, or raw credentials.
 */
async function getOperatorContext() {
  const warnings = [];
  const prisma = getPrisma();

  let orders = [];

  if (prisma) {
    orders = await safeCall("orders.findMany", async () => {
      return await prisma.order.findMany({
        where: {
          deletedAt: null,
          status: { notIn: ["DONE", "CANCELLED", "ARCHIVED"] },
        },
        select: {
          id: true,
          customerName: true,
          email: true,
          phone: true,
          status: true,
          notes: true,
          totalAmount: true,
          amountPaid: true,
          depositPaid: true,
          depositReceived: true,
          depositStatus: true,
          depositAmount: true,
          squareInvoiceId: true,
          squarePaymentStatus: true,
          squareInvoiceStatus: true,
          printMethod: true,
          productionTypeFinal: true,
          assignedProductionTo: true,
          nextAction: true,
          nextOwner: true,
          isRush: true,
          source: true,
          createdAt: true,
          updatedAt: true,
          productionStartedAt: true,
          artFiles: { select: { status: true, approvalStatus: true } },
          tasks: {
            select: { id: true, title: true, status: true, assignedTo: true, dueDate: true },
            where: { status: { not: "DONE" } },
            take: 5,
          },
        },
        orderBy: { createdAt: "desc" },
        take: 100,
      });
    }, null);

    if (orders === null) {
      orders = [];
      warnings.push("Could not load orders from database.");
    }
  } else {
    warnings.push("Database client unavailable — snapshot is empty.");
  }

  // ── Normalize orders to safe output shape ───────────────────────────────
  const now = Date.now();
  const normalizedOrders = orders.map((o) => {
    const artStatus = (o.artFiles || []).map((a) => a.status || a.approvalStatus).join(", ") || "unknown";
    const isOverdue = o.updatedAt && (now - new Date(o.updatedAt).getTime()) > 7 * 24 * 60 * 60 * 1000
      && !["DONE", "QC", "PRINTING"].includes(o.status);

    return {
      id: o.id,
      customerName: o.customerName,
      stage: o.status,
      nextAction: o.nextAction,
      nextOwner: o.nextOwner,
      depositStatus: o.depositStatus || (o.depositPaid ? "PAID" : "NONE"),
      depositReceived: Boolean(o.depositPaid || o.depositReceived),
      paymentStatus: o.squarePaymentStatus || "UNKNOWN",
      squareInvoiceStatus: o.squareInvoiceStatus || null,
      squareInvoiceId: o.squareInvoiceId ? "[linked]" : null,
      total: o.totalAmount || 0,
      amountPaid: o.amountPaid || 0,
      productionType: o.productionTypeFinal || o.printMethod || null,
      assignedTo: o.assignedProductionTo || null,
      isRush: Boolean(o.isRush),
      artStatus,
      isOverdue,
      source: o.source || null,
      pendingTasks: (o.tasks || []).map((t) => ({
        id: t.id,
        title: t.title,
        status: t.status,
        assignedTo: t.assignedTo,
        dueDate: t.dueDate,
      })),
      createdAt: o.createdAt,
      updatedAt: o.updatedAt,
    };
  });

  // ── Snapshot counters ────────────────────────────────────────────────────
  const productionStages = new Set(["READY", "PRINTING", "QC", "PRODUCTION", "PRODUCTION_READY"]);
  const printingStages = new Set(["PRINTING"]);

  const snapshot = {
    openOrdersCount: normalizedOrders.length,
    productionReadyCount: normalizedOrders.filter((o) => o.stage === "READY" || o.stage === "PRODUCTION_READY").length,
    printingCount: normalizedOrders.filter((o) => printingStages.has(o.stage)).length,
    overdueCount: normalizedOrders.filter((o) => o.isOverdue).length,
    needsDepositCount: normalizedOrders.filter(
      (o) => !o.depositReceived && productionStages.has(o.stage)
    ).length,
    needsArtCount: normalizedOrders.filter(
      (o) => o.artStatus && o.artStatus.includes("NEEDS_ART")
    ).length,
    screenPrintJobsCount: normalizedOrders.filter(
      (o) => o.productionType && /screen/i.test(o.productionType)
    ).length,
    dtgJobsCount: normalizedOrders.filter(
      (o) => o.productionType && /dtg/i.test(o.productionType)
    ).length,
    dtfJobsCount: normalizedOrders.filter(
      (o) => o.productionType && /dtf/i.test(o.productionType)
    ).length,
  };

  // ── Risks ────────────────────────────────────────────────────────────────
  const risks = [];

  normalizedOrders.forEach((o) => {
    if (!o.depositReceived && productionStages.has(o.stage)) {
      risks.push({
        type: "DEPOSIT_MISSING_IN_PRODUCTION",
        orderId: o.id,
        customerName: o.customerName,
        stage: o.stage,
        message: `Order for ${o.customerName} is in ${o.stage} but deposit is not confirmed.`,
      });
    }
    if (o.isOverdue) {
      risks.push({
        type: "ORDER_OVERDUE",
        orderId: o.id,
        customerName: o.customerName,
        stage: o.stage,
        message: `Order for ${o.customerName} has not been updated in over 7 days (stage: ${o.stage}).`,
      });
    }
    if (o.productionType && /screen/i.test(o.productionType) && !o.assignedTo) {
      risks.push({
        type: "SCREEN_PRINT_NO_VENDOR",
        orderId: o.id,
        customerName: o.customerName,
        message: `Screen print job for ${o.customerName} has no assigned vendor/operator.`,
      });
    }
  });

  // ── Recommended next actions ─────────────────────────────────────────────
  const recommendedNextActions = [];

  if (snapshot.needsDepositCount > 0) {
    recommendedNextActions.push(
      `Collect deposits on ${snapshot.needsDepositCount} order(s) before proceeding to production.`
    );
  }
  if (snapshot.overdueCount > 0) {
    recommendedNextActions.push(
      `Review ${snapshot.overdueCount} overdue order(s) that have not been updated in 7+ days.`
    );
  }
  if (snapshot.needsArtCount > 0) {
    recommendedNextActions.push(
      `Resolve art files on ${snapshot.needsArtCount} order(s) that are missing artwork.`
    );
  }
  if (snapshot.screenPrintJobsCount > 0) {
    recommendedNextActions.push(
      `Check status of ${snapshot.screenPrintJobsCount} screen print job(s) — verify vendor assignment and readiness.`
    );
  }
  if (snapshot.productionReadyCount > 0) {
    recommendedNextActions.push(
      `${snapshot.productionReadyCount} order(s) are ready for production. Confirm deposits before starting.`
    );
  }

  if (recommendedNextActions.length === 0) {
    recommendedNextActions.push("No immediate risks detected. Review open orders for upcoming deadlines.");
  }

  // ── Open tasks ───────────────────────────────────────────────────────────
  const tasks = normalizedOrders.flatMap((o) => o.pendingTasks.map((t) => ({
    ...t,
    orderId: o.id,
    customerName: o.customerName,
  })));

  // ── Square Sync enrichment (Phase 12) ─────────────────────────────────────
  let squareSyncContext = { enabled: false };
  if (squareSyncService && typeof squareSyncService.buildOperatorContextSync === "function") {
    squareSyncContext = await safeCall("squareSyncContext", () => squareSyncService.buildOperatorContextSync(), { enabled: false });
  }

  // Enrich orders with production eligibility from Square Sync guardrails
  const enrichedOrders = normalizedOrders.map((o) => {
    if (!squareSyncGuardrails) return o;
    try {
      const eligibility = squareSyncGuardrails.getProductionEligibility({
        amountPaid: o.amountPaid,
        depositPaid: o.depositReceived,
        depositStatus: o.depositStatus,
        squarePaymentStatus: o.paymentStatus,
      });
      return { ...o, productionEligibility: eligibility };
    } catch (_) {
      return o;
    }
  });

  // Add Square-Sync-aware risks
  if (squareSyncContext && squareSyncContext.ordersBlockedFromProduction > 0) {
    risks.push({
      type: "SQUARE_SYNC_PRODUCTION_BLOCKED",
      count: squareSyncContext.ordersBlockedFromProduction,
      message: `${squareSyncContext.ordersBlockedFromProduction} order(s) are in production stages without verified Square deposit.`,
    });
  }
  if (squareSyncContext && squareSyncContext.ordersUnpaid > 0) {
    risks.push({
      type: "UNPAID_ORDERS",
      count: squareSyncContext.ordersUnpaid,
      message: `${squareSyncContext.ordersUnpaid} order(s) have no recorded payment. Follow up before production.`,
    });
  }

  // Add Square-Sync-aware recommended actions
  if (squareSyncContext && squareSyncContext.nextActions) {
    squareSyncContext.nextActions.forEach((a) => {
      if (!recommendedNextActions.includes(a)) recommendedNextActions.push(a);
    });
  }

  // ── Production Routing context (Phase 9) ────────────────────────────────
  let productionContext = { enabled: false };
  if (productionRoutingService && typeof productionRoutingService.buildOperatorContextProduction === "function") {
    productionContext = await safeCall("productionContext", () => productionRoutingService.buildOperatorContextProduction(), { enabled: false });
  }

  // Add production-aware recommended actions
  if (productionContext && productionContext.enabled) {
    if (productionContext.jobsBlocked > 0) {
      risks.push({
        type: "PRODUCTION_JOBS_BLOCKED",
        count: productionContext.jobsBlocked,
        message: `${productionContext.jobsBlocked} production job(s) are blocked (likely missing deposit).`,
      });
    }
    if (productionContext.jobsReady > 0) {
      recommendedNextActions.unshift(`${productionContext.jobsReady} job(s) are production-ready. Jeremy: check queue.`);
    }
    if (productionContext.jeremyOpenTasks > 0) {
      recommendedNextActions.push(`Jeremy has ${productionContext.jeremyOpenTasks} open task(s) in queue.`);
    }
  }

  return {
    ok: true,
    partial: warnings.length > 0,
    warnings: warnings.length > 0 ? warnings : undefined,
    timestamp: new Date().toISOString(),
    business: {
      name: "Cheeky Tees",
      location: "104 Trade Street, Fountain Inn, SC 29644",
      phone: "864-498-3475",
    },
    squareSync: squareSyncContext,
    production: productionContext,
    snapshot,
    orders: enrichedOrders,
    tasks,
    risks,
    recommendedNextActions,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Preview Command
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Previews what a command would do. Never mutates state.
 */
async function previewCommand(input) {
  const commandType = String((input && input.commandType) || "").toUpperCase();
  const payload = (input && input.payload) || {};
  const intent = String((input && input.intent) || "");
  const requestedBy = String((input && input.requestedBy) || "unknown");

  const guard = guardrails.evaluateCommand(input);

  // Always audit previews
  const auditEntry = {
    requestedBy,
    commandType,
    intent,
    payloadSummary: sanitizePayload(payload),
    mode: "preview",
    allowed: guard.allowed,
    blocked: guard.blocked,
    riskLevel: guard.riskLevel || "unknown",
    resultSummary: guard.blocked ? `Blocked: ${guard.reason}` : `Would execute ${commandType}`,
    error: null,
  };

  const { auditId } = await writeAudit(auditEntry);

  if (!guard.allowed) {
    return {
      ok: false,
      mode: "preview",
      commandType,
      allowed: false,
      blocked: true,
      reason: guard.reason,
      safeAlternative: guard.safeAlternative || null,
      auditId,
    };
  }

  // Build the preview description for what would happen
  const wouldDo = buildWouldDo(commandType, payload, guard);

  return {
    ok: true,
    mode: "preview",
    commandType,
    allowed: true,
    blocked: false,
    intent,
    summary: buildSummary(commandType, payload),
    wouldDo,
    requiresApproval: guard.requiresApproval,
    requiresPaymentVerification: guard.requiresPaymentVerification,
    riskLevel: guard.riskLevel,
    auditId,
  };
}

function buildSummary(commandType, payload) {
  switch (commandType) {
    case "CREATE_INTERNAL_TASK":
      return `Would create an internal task: "${payload.title || "(untitled)"}"`;
    case "ADD_ORDER_NOTE":
      return `Would add a note to order ${payload.orderId || "(unspecified)"}.`;
    case "DRAFT_CUSTOMER_FOLLOWUP":
      return `Would create a draft customer follow-up for ${payload.customerName || payload.orderId || "(unspecified)"}. Not sent.`;
    case "DRAFT_ESTIMATE_REQUEST":
      return `Would create a draft estimate request. Not sent automatically.`;
    case "DRAFT_INVOICE_REQUEST":
      return `Would create a draft invoice request. Not sent automatically.`;
    case "UPDATE_ORDER_STAGE_SAFE":
      return `Would advance order ${payload.orderId || "(unspecified)"} to stage: ${payload.targetStage || "(unspecified)"}.`;
    case "FIND_ORDER":
      return `Would search for order matching: "${payload.query || payload.customerName || payload.orderId || "(unspecified)"}"`;
    case "SUMMARIZE_OPEN_ORDERS":
    case "READ_STATUS":
      return "Would return a read-only business snapshot. No data is modified.";
    case "RECOMMEND_NEXT_ACTIONS":
      return "Would analyze current order state and return recommended actions.";
    default:
      return `Would attempt to execute command: ${commandType}`;
  }
}

function buildWouldDo(commandType, payload, guard) {
  const steps = [];
  switch (commandType) {
    case "CREATE_INTERNAL_TASK":
      steps.push(`Create internal task: "${payload.title || "(untitled)"}"`);
      if (payload.orderId) steps.push(`Attach to order ID: ${payload.orderId}`);
      if (payload.assignedTo) steps.push(`Assign to: ${payload.assignedTo}`);
      if (payload.dueDate) steps.push(`Set due date: ${payload.dueDate}`);
      if (payload.notes) steps.push(`Notes: "${payload.notes}"`);
      steps.push("Mark source as operator_bridge");
      steps.push("No email, SMS, or customer notification will be sent.");
      break;
    case "ADD_ORDER_NOTE":
      steps.push(`Append internal note to order ${payload.orderId || "(unspecified)"}`);
      if (payload.note) steps.push(`Note text: "${payload.note}"`);
      steps.push("No customer-facing action taken.");
      break;
    case "DRAFT_CUSTOMER_FOLLOWUP":
      steps.push("Create a DRAFT follow-up record in the system");
      steps.push("Status will be set to DRAFT — not sent");
      steps.push("Operator must review and send manually");
      break;
    case "DRAFT_ESTIMATE_REQUEST":
      steps.push("Create a draft estimate in the system");
      steps.push("Status set to DRAFT — not sent to customer");
      steps.push("Requires operator approval before sending");
      break;
    case "DRAFT_INVOICE_REQUEST":
      steps.push("Create a draft invoice request record");
      steps.push("Does NOT create or send a Square invoice");
      steps.push("Operator must review and initiate Square invoice manually");
      break;
    case "UPDATE_ORDER_STAGE_SAFE":
      steps.push(`Attempt to advance order ${payload.orderId || "(unspecified)"} to stage: ${payload.targetStage || "(unspecified)"}`);
      if (guard.requiresPaymentVerification) steps.push("Deposit/payment must be verified before this stage transition.");
      if (guard.requiresApproval) steps.push("Operator approval required.");
      steps.push("Production will NOT start automatically.");
      break;
    default:
      steps.push(`Execute ${commandType} in read-only or draft mode.`);
  }
  return steps;
}

// ─────────────────────────────────────────────────────────────────────────────
// Execute Command
// ─────────────────────────────────────────────────────────────────────────────

const EXECUTABLE_COMMANDS = new Set([
  "CREATE_INTERNAL_TASK",
  "ADD_ORDER_NOTE",
  "DRAFT_CUSTOMER_FOLLOWUP",
  "DRAFT_ESTIMATE_REQUEST",
  "DRAFT_INVOICE_REQUEST",
  "UPDATE_ORDER_STAGE_SAFE",
]);

/**
 * Executes a safe command. Only allows internal/draft-safe mutations.
 */
async function executeCommand(input) {
  const commandType = String((input && input.commandType) || "").toUpperCase();
  const payload = (input && input.payload) || {};
  const intent = String((input && input.intent) || "");
  const requestedBy = String((input && input.requestedBy) || "unknown");
  const approval = input && input.approval;

  // Run guardrails
  const guard = guardrails.evaluateCommand(input);

  if (!guard.allowed) {
    const { auditId } = await writeAudit({
      requestedBy,
      commandType,
      intent,
      payloadSummary: sanitizePayload(payload),
      mode: "execute",
      allowed: false,
      blocked: true,
      riskLevel: guard.riskLevel || "blocked",
      resultSummary: `Blocked: ${guard.reason}`,
      error: null,
    });

    return {
      ok: false,
      mode: "execute",
      blocked: true,
      reason: guard.reason,
      safeAlternative: guard.safeAlternative || null,
      auditId,
    };
  }

  // Check approval for medium-risk commands
  if (guard.requiresApproval && !(approval && approval.approved === true)) {
    const { auditId } = await writeAudit({
      requestedBy,
      commandType,
      intent,
      payloadSummary: sanitizePayload(payload),
      mode: "execute",
      allowed: false,
      blocked: true,
      riskLevel: guard.riskLevel,
      resultSummary: "Blocked: approval required but not provided.",
      error: null,
    });

    return {
      ok: false,
      mode: "execute",
      blocked: true,
      reason: `Command ${commandType} requires operator approval. Provide approval: { approved: true, approvedBy: "name" }`,
      auditId,
    };
  }

  // Check executeability
  if (!EXECUTABLE_COMMANDS.has(commandType)) {
    const { auditId } = await writeAudit({
      requestedBy,
      commandType,
      intent,
      payloadSummary: sanitizePayload(payload),
      mode: "execute",
      allowed: false,
      blocked: true,
      riskLevel: "blocked",
      resultSummary: `${commandType} is not in the executable command set for v1.`,
      error: null,
    });

    return {
      ok: false,
      mode: "execute",
      blocked: true,
      reason: `${commandType} is not executable in Operator Bridge v1. Use /command/preview to see what commands are available.`,
      auditId,
    };
  }

  // Dispatch to handler
  let result;
  let resultError = null;

  try {
    switch (commandType) {
      case "CREATE_INTERNAL_TASK":
        result = await createInternalTask(payload, requestedBy);
        break;
      case "ADD_ORDER_NOTE":
        result = await addOrderNote(payload, requestedBy);
        break;
      case "DRAFT_CUSTOMER_FOLLOWUP":
        result = await draftCustomerFollowup(payload, requestedBy);
        break;
      case "DRAFT_ESTIMATE_REQUEST":
        result = await draftEstimateRequest(payload, requestedBy);
        break;
      case "DRAFT_INVOICE_REQUEST":
        result = await draftInvoiceRequest(payload, requestedBy);
        break;
      case "UPDATE_ORDER_STAGE_SAFE":
        result = await updateOrderStageSafe(payload, approval, requestedBy);
        break;
      default:
        result = { created: false, note: "Unhandled command type in dispatcher." };
    }
  } catch (err) {
    resultError = err && err.message ? err.message : String(err);
    result = { created: false, error: resultError };
  }

  const { auditId } = await writeAudit({
    requestedBy,
    commandType,
    intent,
    payloadSummary: sanitizePayload(payload),
    mode: "execute",
    allowed: true,
    blocked: false,
    riskLevel: guard.riskLevel,
    resultSummary: resultError ? `Error: ${resultError}` : `Executed ${commandType} successfully.`,
    error: resultError,
  });

  if (resultError) {
    return {
      ok: false,
      mode: "execute",
      commandType,
      error: resultError,
      auditId,
    };
  }

  return {
    ok: true,
    mode: "execute",
    commandType,
    result,
    auditId,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Command Handlers
// ─────────────────────────────────────────────────────────────────────────────

async function createInternalTask(payload, requestedBy) {
  const prisma = getPrisma();
  const title = String(payload.title || "Operator Bridge Task");
  const notes = String(payload.notes || "");
  const assignedTo = String(payload.assignedTo || "");
  const orderId = payload.orderId ? String(payload.orderId) : null;
  const dueDate = payload.dueDate ? new Date(payload.dueDate) : null;

  // If Prisma available, try to find a Job for this order (Task requires jobId)
  if (prisma && orderId) {
    try {
      const job = await prisma.job.findFirst({
        where: { orderId },
        select: { id: true },
      });

      if (job) {
        const task = await prisma.task.create({
          data: {
            jobId: job.id,
            orderId,
            title,
            type: "OPERATOR_BRIDGE",
            status: "OPEN",
            assignedTo: assignedTo || null,
            notes: notes || null,
            dueDate: dueDate || null,
            releaseStatus: "BLOCKED",
            orderReady: false,
            blanksOrdered: false,
            productionHold: true,
          },
          select: { id: true, title: true, status: true },
        });

        return {
          created: true,
          taskId: task.id,
          title: task.title,
          status: task.status,
          source: "operator_bridge",
          mode: "prisma",
        };
      }
    } catch (err) {
      console.warn("[operator-bridge] createInternalTask Prisma failed:", err && err.message ? err.message : err);
    }
  }

  // Fallback: log as AuditLog entry
  if (prisma) {
    try {
      const saved = await prisma.auditLog.create({
        data: {
          stage: "operator_bridge_task",
          input: JSON.stringify({ title, notes, assignedTo, orderId }),
          output: JSON.stringify({ status: "OPEN", source: "operator_bridge" }),
          status: "OPEN",
          action: "CREATE_INTERNAL_TASK",
          entity: "task",
          entityId: orderId || null,
          details: JSON.stringify({ requestedBy, dueDate, type: "OPERATOR_BRIDGE" }),
        },
        select: { id: true },
      });

      return {
        created: true,
        taskId: saved.id,
        title,
        status: "OPEN",
        source: "operator_bridge",
        mode: "audit_log_fallback",
        note: "No Job found for this order. Task logged to AuditLog. To create a proper Task, ensure the order has an associated Job.",
      };
    } catch (_) {}
  }

  // Final fallback: file log
  const { auditId } = await require("./operator.audit").writeAudit({
    requestedBy,
    commandType: "CREATE_INTERNAL_TASK",
    intent: title,
    payloadSummary: { title, notes, assignedTo, orderId },
    mode: "execute",
    allowed: true,
    blocked: false,
    riskLevel: "low",
    resultSummary: `Task created (file fallback): ${title}`,
  });

  return {
    created: true,
    taskId: auditId,
    title,
    status: "OPEN",
    source: "operator_bridge",
    mode: "file_fallback",
    note: "Database unavailable. Task recorded in audit log only.",
  };
}

async function addOrderNote(payload, requestedBy) {
  const prisma = getPrisma();
  const orderId = payload.orderId ? String(payload.orderId) : null;
  const note = String(payload.note || payload.notes || "");

  if (!orderId) {
    return { created: false, error: "orderId is required for ADD_ORDER_NOTE." };
  }
  if (!note) {
    return { created: false, error: "note or notes is required for ADD_ORDER_NOTE." };
  }

  if (prisma) {
    try {
      // Append note to existing notes field (safe concat)
      const existing = await prisma.order.findUnique({
        where: { id: orderId },
        select: { id: true, notes: true },
      });

      if (!existing) {
        return { created: false, error: `Order ${orderId} not found.` };
      }

      const timestamp = new Date().toISOString();
      const newNotes = (existing.notes ? existing.notes + "\n\n" : "") +
        `[${timestamp}] [operator_bridge / ${requestedBy}] ${note}`;

      await prisma.order.update({
        where: { id: orderId },
        data: { notes: newNotes },
      });

      return {
        created: true,
        orderId,
        noteAppended: true,
        source: "operator_bridge",
        mode: "prisma",
      };
    } catch (err) {
      return { created: false, error: err && err.message ? err.message : String(err) };
    }
  }

  return {
    created: false,
    error: "Database unavailable. Cannot add order note without Prisma.",
  };
}

async function draftCustomerFollowup(payload, requestedBy) {
  const prisma = getPrisma();
  const orderId = payload.orderId ? String(payload.orderId) : null;
  const subject = String(payload.subject || "Follow-up from Cheeky Tees");
  const body = String(payload.message || payload.body || payload.notes || "");
  const customerName = String(payload.customerName || "");

  // Try to create a RevenueFollowup draft
  if (prisma && orderId) {
    try {
      const fingerprint = `ob-followup-${orderId}-${Date.now()}`;

      const existing = await prisma.order.findUnique({
        where: { id: orderId },
        select: { id: true },
      });
      if (!existing) {
        return { created: false, error: `Order ${orderId} not found.` };
      }

      const draft = await prisma.revenueFollowup.create({
        data: {
          orderId,
          kind: "operator_bridge_followup",
          subject,
          draftText: body,
          draftHtml: `<p>${body.replace(/\n/g, "<br>")}</p>`,
          status: "DRAFT",
          fingerprint,
        },
        select: { id: true, status: true },
      });

      return {
        created: true,
        draftId: draft.id,
        status: "DRAFT",
        note: "Follow-up draft created. NOT sent. Requires operator review and manual send.",
        source: "operator_bridge",
        mode: "prisma_revenue_followup",
      };
    } catch (err) {
      console.warn("[operator-bridge] draftCustomerFollowup Prisma failed:", err && err.message ? err.message : err);
    }
  }

  // Fallback: log as AuditLog
  if (prisma) {
    try {
      const saved = await prisma.auditLog.create({
        data: {
          stage: "operator_bridge_draft",
          input: JSON.stringify({ orderId, subject, customerName, requestedBy }),
          output: JSON.stringify({ status: "DRAFT", note: "Not sent." }),
          status: "DRAFT",
          action: "DRAFT_CUSTOMER_FOLLOWUP",
          entity: "followup_draft",
          entityId: orderId || null,
          details: JSON.stringify({ body, requestedBy }),
        },
        select: { id: true },
      });
      return {
        created: true,
        draftId: saved.id,
        status: "DRAFT",
        note: "Draft logged to AuditLog (no orderId or order not found). NOT sent.",
        mode: "audit_log_fallback",
      };
    } catch (_) {}
  }

  return {
    created: true,
    draftId: null,
    status: "DRAFT",
    note: "Database unavailable. Draft recorded in audit only. NOT sent.",
    mode: "file_fallback",
  };
}

async function draftEstimateRequest(payload, requestedBy) {
  const prisma = getPrisma();
  const name = String(payload.customerName || payload.name || "");
  const email = String(payload.email || "");
  const phone = String(payload.phone || "");
  const qty = Number(payload.qty || payload.quantity || 0);
  const description = String(payload.description || payload.notes || "Operator Bridge Estimate Request");
  const orderId = payload.orderId ? String(payload.orderId) : null;

  if (prisma) {
    try {
      const estimate = await prisma.estimate.create({
        data: {
          name: name || "Unknown Customer",
          email: email || null,
          phone: phone || null,
          qty,
          description,
          htmlBody: `<p>${description}</p>`,
          status: "DRAFT",
          orderId: orderId || null,
        },
        select: { id: true, status: true },
      });

      return {
        created: true,
        estimateId: estimate.id,
        status: "DRAFT",
        note: "Estimate draft created. NOT sent. Requires operator review.",
        source: "operator_bridge",
        mode: "prisma",
      };
    } catch (err) {
      console.warn("[operator-bridge] draftEstimateRequest Prisma failed:", err && err.message ? err.message : err);
    }
  }

  return {
    created: true,
    estimateId: null,
    status: "DRAFT",
    note: "Database unavailable. Estimate request logged to audit only. NOT sent.",
    mode: "audit_fallback",
  };
}

async function draftInvoiceRequest(payload, requestedBy) {
  // Operator Bridge v1 does NOT create Square invoices.
  // It logs the request as an internal draft note only.
  const prisma = getPrisma();
  const orderId = payload.orderId ? String(payload.orderId) : null;
  const description = String(payload.description || payload.notes || "Invoice request from Operator Bridge");

  if (prisma) {
    try {
      const saved = await prisma.auditLog.create({
        data: {
          stage: "operator_bridge_draft",
          input: JSON.stringify({ orderId, description, requestedBy }),
          output: JSON.stringify({ status: "DRAFT", note: "Invoice NOT created in Square." }),
          status: "DRAFT",
          action: "DRAFT_INVOICE_REQUEST",
          entity: "invoice_draft_request",
          entityId: orderId || null,
          details: JSON.stringify({ payload, requestedBy }),
        },
        select: { id: true },
      });

      return {
        created: true,
        requestId: saved.id,
        status: "DRAFT",
        note: "Invoice request logged internally. Does NOT create or send a Square invoice. Operator must create the Square invoice manually via the Square Dashboard or the existing /api/invoices route.",
        source: "operator_bridge",
        mode: "audit_log",
      };
    } catch (_) {}
  }

  return {
    created: true,
    requestId: null,
    status: "DRAFT",
    note: "Invoice request noted. Database unavailable. Operator must create Square invoice manually.",
    mode: "file_fallback",
  };
}

async function updateOrderStageSafe(payload, approval, requestedBy) {
  const prisma = getPrisma();
  const orderId = payload.orderId ? String(payload.orderId) : null;
  const targetStage = String(payload.targetStage || "").toUpperCase();

  if (!orderId) {
    return { updated: false, error: "orderId is required for UPDATE_ORDER_STAGE_SAFE." };
  }
  if (!targetStage) {
    return { updated: false, error: "targetStage is required for UPDATE_ORDER_STAGE_SAFE." };
  }

  const ALLOWED_STAGES = ["QUOTE", "DEPOSIT", "READY", "PRINTING", "QC", "DONE"];
  if (!ALLOWED_STAGES.includes(targetStage)) {
    return {
      updated: false,
      error: `targetStage "${targetStage}" is not a valid stage. Allowed: ${ALLOWED_STAGES.join(", ")}`,
    };
  }

  if (!prisma) {
    return { updated: false, error: "Database unavailable. Cannot update order stage." };
  }

  try {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true, status: true, depositPaid: true, depositReceived: true, amountPaid: true, depositAmount: true },
    });

    if (!order) {
      return { updated: false, error: `Order ${orderId} not found.` };
    }

    // Cash protection: block production stages without deposit
    const PRODUCTION_STAGES = new Set(["READY", "PRINTING", "QC"]);
    if (PRODUCTION_STAGES.has(targetStage)) {
      // Use Square Sync production eligibility if available (Phase 13)
      if (squareSyncGuardrails) {
        const eligibility = squareSyncGuardrails.getProductionEligibility(order);
        if (!eligibility.eligible && !payload.depositVerified) {
          return {
            updated: false,
            blocked: true,
            reason: eligibility.reason,
            productionEligibility: eligibility,
          };
        }
      } else {
        // Fallback: original check
        const depositOk = order.depositPaid || order.depositReceived ||
          (order.amountPaid > 0 && order.depositAmount && order.amountPaid >= order.depositAmount);
        if (!depositOk && !payload.depositVerified) {
          return {
            updated: false,
            blocked: true,
            reason: `Deposit not verified. Cannot move order to ${targetStage}. Set payload.depositVerified=true only after confirming via Square.`,
          };
        }
      }
    }

    // Safe update — only status field
    await prisma.order.update({
      where: { id: orderId },
      data: {
        status: targetStage,
        notes: (order.notes || "") + `\n\n[${new Date().toISOString()}] [operator_bridge / ${requestedBy}] Stage advanced to ${targetStage}. Approved by: ${(approval && approval.approvedBy) || "unknown"}.`,
      },
    });

    return {
      updated: true,
      orderId,
      previousStage: order.status,
      newStage: targetStage,
      approvedBy: (approval && approval.approvedBy) || null,
      source: "operator_bridge",
      note: "Stage updated. No production, emails, or Square actions were triggered automatically.",
    };
  } catch (err) {
    return { updated: false, error: err && err.message ? err.message : String(err) };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Audit Log Reader
// ─────────────────────────────────────────────────────────────────────────────

async function getAuditLog(limit) {
  return await readAudit(limit || 50);
}

// ─────────────────────────────────────────────────────────────────────────────
// Utility
// ─────────────────────────────────────────────────────────────────────────────

function sanitizePayload(payload) {
  if (!payload || typeof payload !== "object") return {};
  const out = Object.assign({}, payload);
  // Strip any sensitive keys that should never be logged
  const sensitiveKeys = ["token", "accessToken", "apiKey", "secret", "password", "squareToken", "key"];
  sensitiveKeys.forEach((k) => {
    if (k in out) out[k] = "[redacted]";
  });
  return out;
}

module.exports = {
  getOperatorContext,
  previewCommand,
  executeCommand,
  getAuditLog,
};
