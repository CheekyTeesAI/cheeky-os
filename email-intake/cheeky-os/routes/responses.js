/**
 * Bundle 29 — POST /responses/ingest (interpretation + optional order memory + recent queue).
 * Bundle 30 — POST /responses/queue-next-step (interpretation + next-step action + optional history).
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
const MAX_RECENT = 50;

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

module.exports = {
  router,
  readRecentEntries,
  readRecentNextStepEntries,
};
