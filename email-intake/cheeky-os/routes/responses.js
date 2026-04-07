/**
 * Bundle 29 — POST /responses/ingest (interpretation + optional order memory + recent queue).
 * Bundle 30 — POST /responses/queue-next-step (interpretation + next-step action + optional history).
 * Bundle 32 — POST /responses/auto-invoice (guarded draft only, no send/charge).
 * Bundle 33 — POST /responses/prepare-reply (reply draft text only, no send).
 */

const express = require("express");
const fs = require("fs");
const path = require("path");
const { getPrisma } = require("../marketing/prisma-client");
const {
  addNote,
  addHistory,
  memoryInnerToJson,
} = require("../services/orderMemoryService");
const { interpretCustomerResponse } = require("../services/responseInterpretationService");
const {
  buildQueuedActionFromInterpretation,
} = require("../services/nextStepTriggerService");
const { evaluateAutoInvoiceGuard } = require("../services/autoInvoiceGuardService");
const { createDraftInvoice } = require("../services/squareDraftInvoice");
const { buildReplyDraft } = require("../services/replyDraftService");

const router = express.Router();

const RECENT_FILE = path.join(
  __dirname,
  "..",
  "data",
  "response-ingest-recent.json"
);
const NEXT_STEP_RECENT_FILE = path.join(
  __dirname,
  "..",
  "data",
  "response-next-step-recent.json"
);
const AUTO_INVOICE_RECENT_FILE = path.join(
  __dirname,
  "..",
  "data",
  "response-auto-invoice-recent.json"
);
/** Same path as invoiceExecutorService — shared dedupe for draft invoices. */
const INVOICE_AUTO_STATE_FILE = path.join(
  __dirname,
  "..",
  "data",
  "invoice-auto-state.json"
);
const AUTO_INVOICE_THROTTLE_FILE = path.join(
  __dirname,
  "..",
  "data",
  "response-auto-invoice-throttle.json"
);
const REPLY_DRAFT_RECENT_FILE = path.join(
  __dirname,
  "..",
  "data",
  "response-reply-draft-recent.json"
);
const MAX_RECENT = 50;
const INVOICE_EXISTS_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const AUTO_INVOICE_THROTTLE_MS = 90 * 1000;

/**
 * @param {object} entry
 */
function appendRecentEntry(entry) {
  let data = { entries: [] };
  try {
    const txt = fs.readFileSync(RECENT_FILE, "utf8");
    const j = JSON.parse(txt);
    if (j && Array.isArray(j.entries)) data = { entries: j.entries };
  } catch (_) {}
  data.entries.unshift(entry);
  if (data.entries.length > MAX_RECENT) {
    data.entries = data.entries.slice(0, MAX_RECENT);
  }
  const dir = path.dirname(RECENT_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(RECENT_FILE, JSON.stringify(data, null, 2), "utf8");
}

/**
 * @returns {{ entries: object[] }}
 */
function readRecentEntries() {
  try {
    const txt = fs.readFileSync(RECENT_FILE, "utf8");
    const j = JSON.parse(txt);
    if (j && Array.isArray(j.entries)) return { entries: j.entries };
  } catch (_) {}
  return { entries: [] };
}

/**
 * @param {object} entry
 */
function appendRecentNextStep(entry) {
  let data = { entries: [] };
  try {
    const txt = fs.readFileSync(NEXT_STEP_RECENT_FILE, "utf8");
    const j = JSON.parse(txt);
    if (j && Array.isArray(j.entries)) data = { entries: j.entries };
  } catch (_) {}
  data.entries.unshift(entry);
  if (data.entries.length > MAX_RECENT) {
    data.entries = data.entries.slice(0, MAX_RECENT);
  }
  const dir = path.dirname(NEXT_STEP_RECENT_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    NEXT_STEP_RECENT_FILE,
    JSON.stringify(data, null, 2),
    "utf8"
  );
}

/**
 * @returns {{ entries: object[] }}
 */
function readRecentNextStepEntries() {
  try {
    const txt = fs.readFileSync(NEXT_STEP_RECENT_FILE, "utf8");
    const j = JSON.parse(txt);
    if (j && Array.isArray(j.entries)) return { entries: j.entries };
  } catch (_) {}
  return { entries: [] };
}

/**
 * @returns {{ byCustomerId: Record<string, { invoiceId?: string, createdAt?: string }> }}
 */
function loadInvoiceAutoStateForDedupe() {
  try {
    const txt = fs.readFileSync(INVOICE_AUTO_STATE_FILE, "utf8");
    const j = JSON.parse(txt);
    if (
      j &&
      typeof j === "object" &&
      j.byCustomerId &&
      typeof j.byCustomerId === "object"
    ) {
      return { byCustomerId: { ...j.byCustomerId } };
    }
  } catch (_) {}
  return { byCustomerId: {} };
}

/**
 * @param {{ byCustomerId: Record<string, { invoiceId?: string, createdAt?: string }> }} s
 */
function saveInvoiceAutoStateForDedupe(s) {
  const dir = path.dirname(INVOICE_AUTO_STATE_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    INVOICE_AUTO_STATE_FILE,
    JSON.stringify(s, null, 2),
    "utf8"
  );
}

/**
 * @param {string} customerId
 * @param {number} windowMs
 */
function isRecentDraftForCustomer(customerId, state, windowMs) {
  const cid = String(customerId || "").trim();
  if (!cid) return false;
  const e = state.byCustomerId[cid];
  if (!e || !e.createdAt) return false;
  const t = new Date(e.createdAt).getTime();
  if (!Number.isFinite(t)) return false;
  return Date.now() - t < windowMs;
}

/**
 * @returns {{ byCustomerId: Record<string, string> }}
 */
function loadAutoInvoiceThrottle() {
  try {
    const txt = fs.readFileSync(AUTO_INVOICE_THROTTLE_FILE, "utf8");
    const j = JSON.parse(txt);
    if (
      j &&
      typeof j === "object" &&
      j.byCustomerId &&
      typeof j.byCustomerId === "object"
    ) {
      return { byCustomerId: { ...j.byCustomerId } };
    }
  } catch (_) {}
  return { byCustomerId: {} };
}

/**
 * @param {{ byCustomerId: Record<string, string> }} s
 */
function saveAutoInvoiceThrottle(s) {
  const dir = path.dirname(AUTO_INVOICE_THROTTLE_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    AUTO_INVOICE_THROTTLE_FILE,
    JSON.stringify(s, null, 2),
    "utf8"
  );
}

/**
 * @param {object} entry
 */
function appendAutoInvoiceRecent(entry) {
  let data = { entries: [] };
  try {
    const txt = fs.readFileSync(AUTO_INVOICE_RECENT_FILE, "utf8");
    const j = JSON.parse(txt);
    if (j && Array.isArray(j.entries)) data = { entries: j.entries };
  } catch (_) {}
  data.entries.unshift(entry);
  if (data.entries.length > MAX_RECENT) {
    data.entries = data.entries.slice(0, MAX_RECENT);
  }
  const dir = path.dirname(AUTO_INVOICE_RECENT_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    AUTO_INVOICE_RECENT_FILE,
    JSON.stringify(data, null, 2),
    "utf8"
  );
}

/**
 * @returns {{ entries: object[] }}
 */
function readRecentAutoInvoiceEntries() {
  try {
    const txt = fs.readFileSync(AUTO_INVOICE_RECENT_FILE, "utf8");
    const j = JSON.parse(txt);
    if (j && Array.isArray(j.entries)) return { entries: j.entries };
  } catch (_) {}
  return { entries: [] };
}

/**
 * @param {object} entry
 */
function appendReplyDraftRecent(entry) {
  let data = { entries: [] };
  try {
    const txt = fs.readFileSync(REPLY_DRAFT_RECENT_FILE, "utf8");
    const j = JSON.parse(txt);
    if (j && Array.isArray(j.entries)) data = { entries: j.entries };
  } catch (_) {}
  data.entries.unshift(entry);
  if (data.entries.length > MAX_RECENT) {
    data.entries = data.entries.slice(0, MAX_RECENT);
  }
  const dir = path.dirname(REPLY_DRAFT_RECENT_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    REPLY_DRAFT_RECENT_FILE,
    JSON.stringify(data, null, 2),
    "utf8"
  );
}

/**
 * @returns {{ entries: object[] }}
 */
function readRecentReplyDraftEntries() {
  try {
    const txt = fs.readFileSync(REPLY_DRAFT_RECENT_FILE, "utf8");
    const j = JSON.parse(txt);
    if (j && Array.isArray(j.entries)) return { entries: j.entries };
  } catch (_) {}
  return { entries: [] };
}

router.post("/ingest", async (req, res) => {
  try {
    const body = req.body || {};
    const customerName = String(body.customerName != null ? body.customerName : "").trim();
    const orderId = String(body.orderId != null ? body.orderId : "").trim();
    const message = String(body.message != null ? body.message : "").trim();

    if (!customerName) {
      return res.json({
        success: false,
        error: "customerName is required",
      });
    }
    if (!message) {
      return res.json({
        success: false,
        error: "message is required",
      });
    }

    const interpretation = interpretCustomerResponse({ customerName, message });

    if (orderId) {
      const prisma = getPrisma();
      if (!prisma || !prisma.captureOrder) {
        return res.json({
          success: false,
          error: "Database not available",
        });
      }

      const order = await prisma.captureOrder.findUnique({ where: { id: orderId } });
      if (!order) {
        return res.json({
          success: false,
          error: "order not found",
        });
      }

      const notePack = addNote(
        order,
        `Customer replied: ${message}`,
        "system"
      );
      if (!notePack.noteAdded) {
        return res.json({
          success: false,
          error: "Could not add note",
        });
      }

      const orderAfterNote = {
        ...order,
        memoryJson: memoryInnerToJson(notePack.innerForStore),
      };
      const histPack = addHistory(
        orderAfterNote,
        `Detected intent: ${interpretation.intent}`
      );

      await prisma.captureOrder.update({
        where: { id: orderId },
        data: { memoryJson: memoryInnerToJson(histPack.innerForStore) },
      });
    }

    appendRecentEntry({
      at: new Date().toISOString(),
      customerName,
      orderId: orderId || "",
      messagePreview: message.length > 160 ? message.slice(0, 157) + "…" : message,
      intent: interpretation.intent,
      recommendedNextStep: interpretation.recommendedNextStep,
    });

    return res.json({
      success: true,
      customerName,
      orderId: orderId || "",
      interpretation: {
        intent: interpretation.intent,
        confidence: interpretation.confidence,
        signals: interpretation.signals,
        recommendedNextStep: interpretation.recommendedNextStep,
      },
    });
  } catch (err) {
    console.error("[responses/ingest]", err.message || err);
    return res.json({
      success: false,
      error: err instanceof Error ? err.message : "failed",
    });
  }
});

router.post("/queue-next-step", async (req, res) => {
  try {
    const body = req.body || {};
    const customerName = String(body.customerName != null ? body.customerName : "").trim();
    const orderId = String(body.orderId != null ? body.orderId : "").trim();
    const message = String(body.message != null ? body.message : "").trim();

    if (!customerName) {
      return res.json({
        success: false,
        error: "customerName is required",
      });
    }
    if (!message) {
      return res.json({
        success: false,
        error: "message is required",
      });
    }

    const interpretation = interpretCustomerResponse({ customerName, message });
    const queuedAction = buildQueuedActionFromInterpretation({
      customerName,
      orderId,
      interpretation,
    });

    if (orderId) {
      const prisma = getPrisma();
      if (!prisma || !prisma.captureOrder) {
        return res.json({
          success: false,
          error: "Database not available",
        });
      }

      const order = await prisma.captureOrder.findUnique({ where: { id: orderId } });
      if (!order) {
        return res.json({
          success: false,
          error: "order not found",
        });
      }

      const histPack = addHistory(
        order,
        `Queued next step: ${queuedAction.actionLabel}`
      );

      await prisma.captureOrder.update({
        where: { id: orderId },
        data: { memoryJson: memoryInnerToJson(histPack.innerForStore) },
      });
    }

    const reasonShort =
      String(queuedAction.reason || "").length > 160
        ? String(queuedAction.reason).slice(0, 157) + "…"
        : String(queuedAction.reason || "");

    appendRecentNextStep({
      at: new Date().toISOString(),
      customerName,
      orderId: orderId || "",
      intent: interpretation.intent,
      actionLabel: queuedAction.actionLabel,
      actionType: queuedAction.actionType,
      priority: queuedAction.priority,
      reason: reasonShort,
    });

    return res.json({
      success: true,
      customerName,
      orderId: orderId || "",
      interpretation: {
        intent: interpretation.intent,
        confidence: interpretation.confidence,
        recommendedNextStep: interpretation.recommendedNextStep,
      },
      queuedAction: {
        actionType: queuedAction.actionType,
        shouldQueue: queuedAction.shouldQueue,
        priority: queuedAction.priority,
        reason: queuedAction.reason,
        actionLabel: queuedAction.actionLabel,
      },
    });
  } catch (err) {
    console.error("[responses/queue-next-step]", err.message || err);
    return res.json({
      success: false,
      error: err instanceof Error ? err.message : "failed",
    });
  }
});

router.post("/prepare-reply", async (req, res) => {
  try {
    const body = req.body || {};
    const customerName = String(body.customerName != null ? body.customerName : "").trim();
    const message = String(body.message != null ? body.message : "").trim();
    const amount = Number(body.amount);

    if (!customerName) {
      return res.json({
        success: false,
        error: "customerName is required",
      });
    }
    if (!message) {
      return res.json({
        success: false,
        error: "message is required",
      });
    }

    const interpretation = interpretCustomerResponse({ customerName, message });
    const { draft, intent } = buildReplyDraft({
      customerName,
      intent: interpretation.intent,
      amount: Number.isFinite(amount) ? amount : 0,
    });

    appendReplyDraftRecent({
      at: new Date().toISOString(),
      customerName,
      intent,
      draft,
      amount: Number.isFinite(amount) ? amount : 0,
    });

    return res.json({
      success: true,
      customerName,
      intent,
      draft,
    });
  } catch (err) {
    console.error("[responses/prepare-reply]", err.message || err);
    return res.json({
      success: false,
      error: err instanceof Error ? err.message : "failed",
    });
  }
});

router.post("/auto-invoice", async (req, res) => {
  const body = req.body || {};
  const customerName = String(body.customerName != null ? body.customerName : "").trim();
  const orderId = String(body.orderId != null ? body.orderId : "").trim();
  const message = String(body.message != null ? body.message : "").trim();
  const customerId = String(body.customerId != null ? body.customerId : "").trim();
  const amount = Number(body.amount);

  function finishThrottle() {
    const cid = String(customerId || "").trim();
    if (!cid) return;
    const th = loadAutoInvoiceThrottle();
    th.byCustomerId[cid] = new Date().toISOString();
    saveAutoInvoiceThrottle(th);
  }

  try {
    if (!customerName) {
      return res.json({
        success: false,
        error: "customerName is required",
      });
    }
    if (!message) {
      return res.json({
        success: false,
        error: "message is required",
      });
    }

    if (orderId) {
      const prisma = getPrisma();
      if (!prisma || !prisma.captureOrder) {
        return res.json({
          success: false,
          error: "Database not available",
        });
      }
      const order = await prisma.captureOrder.findUnique({ where: { id: orderId } });
      if (!order) {
        return res.json({
          success: false,
          error: "order not found",
        });
      }
    }

    const interpretation = interpretCustomerResponse({ customerName, message });
    const invState = loadInvoiceAutoStateForDedupe();
    const invoiceExists = isRecentDraftForCustomer(
      customerId,
      invState,
      INVOICE_EXISTS_WINDOW_MS
    );

    const throttle = loadAutoInvoiceThrottle();
    const lastAt = customerId
      ? throttle.byCustomerId[customerId]
      : "";
    const lastMs = lastAt ? new Date(lastAt).getTime() : 0;
    const cooldownPassed =
      !customerId ||
      !Number.isFinite(lastMs) ||
      Date.now() - lastMs >= AUTO_INVOICE_THROTTLE_MS;

    const guard = evaluateAutoInvoiceGuard({
      customerName,
      customerId,
      orderId,
      intent: interpretation.intent,
      confidence: interpretation.confidence,
      amount,
      invoiceExists,
      cooldownPassed,
    });

    const baseLog = {
      at: new Date().toISOString(),
      customerName,
      orderId: orderId || "",
      amount: Number.isFinite(amount) ? amount : 0,
      intent: interpretation.intent,
      confidence: interpretation.confidence,
      safetyLevel: guard.safetyLevel,
      reason: guard.reason,
      executed: false,
      draftCreated: false,
      invoiceId: "",
    };

    async function writeMemoryDecision(line) {
      if (!orderId) return;
      const prisma = getPrisma();
      if (!prisma || !prisma.captureOrder) return;
      const order = await prisma.captureOrder.findUnique({ where: { id: orderId } });
      if (!order) return;
      const histPack = addHistory(order, `Auto-invoice decision: ${line}`);
      await prisma.captureOrder.update({
        where: { id: orderId },
        data: { memoryJson: memoryInnerToJson(histPack.innerForStore) },
      });
    }

    if (!guard.shouldCreateDraft) {
      appendAutoInvoiceRecent(baseLog);
      finishThrottle();
      await writeMemoryDecision(guard.reason);
      return res.json({
        success: true,
        executed: false,
        draftCreated: false,
        safetyLevel: guard.safetyLevel,
        reason: guard.reason,
        invoiceId: "",
      });
    }

    const desc = customerName.slice(0, 200) || "Custom order";
    const inv = await createDraftInvoice({
      customerId,
      lineItems: [{ name: desc, quantity: 1, price: amount }],
    });

    if (!inv.success) {
      appendAutoInvoiceRecent({
        ...baseLog,
        reason: String(inv.error || "draft_failed"),
        safetyLevel: "review",
      });
      finishThrottle();
      await writeMemoryDecision(String(inv.error || "draft_failed"));
      return res.json({
        success: false,
        executed: true,
        draftCreated: false,
        safetyLevel: "review",
        reason: String(inv.error || "Draft creation failed"),
        invoiceId: "",
      });
    }

    invState.byCustomerId[customerId] = {
      invoiceId: String(inv.invoiceId || ""),
      createdAt: new Date().toISOString(),
    };
    saveInvoiceAutoStateForDedupe(invState);

    const okLog = {
      ...baseLog,
      executed: true,
      draftCreated: true,
      reason: guard.reason,
      safetyLevel: "clear",
      invoiceId: String(inv.invoiceId || ""),
    };
    appendAutoInvoiceRecent(okLog);
    finishThrottle();
    await writeMemoryDecision(
      `${guard.reason} — draft ${String(inv.invoiceId || "").slice(0, 24)}`
    );

    return res.json({
      success: true,
      executed: true,
      draftCreated: true,
      safetyLevel: "clear",
      reason: guard.reason,
      invoiceId: String(inv.invoiceId || ""),
    });
  } catch (err) {
    console.error("[responses/auto-invoice]", err.message || err);
    finishThrottle();
    return res.json({
      success: false,
      executed: false,
      draftCreated: false,
      safetyLevel: "blocked",
      reason: err instanceof Error ? err.message : "failed",
      invoiceId: "",
      error: err instanceof Error ? err.message : "failed",
    });
  }
});

module.exports = {
  router,
  readRecentEntries,
  readRecentNextStepEntries,
  readRecentAutoInvoiceEntries,
  readRecentReplyDraftEntries,
};
