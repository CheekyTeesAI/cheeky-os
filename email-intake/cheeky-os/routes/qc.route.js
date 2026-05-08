"use strict";

const express = require("express");
const path = require("path");

const router = express.Router();
router.use(express.json({ limit: "256kb" }));

const qcEngine = require(path.join(__dirname, "..", "services", "qcEngine.service"));

function getPrisma() {
  try {
    return require(path.join(__dirname, "..", "..", "src", "lib", "prisma"));
  } catch (_e) {
    return null;
  }
}

/** Bucket board for qc.html */
router.get("/board", async (_req, res) => {
  try {
    const prisma = getPrisma();
    if (!prisma || !prisma.order) {
      return res.status(200).json({
        ok: false,
        error: "prisma_unavailable",
        pending: [],
        failed: [],
        passed: [],
        timestamp: new Date().toISOString(),
      });
    }

    const orders = await prisma.order.findMany({
      where: { deletedAt: null, status: { in: ["PRINTING", "QC"] } },
      take: 120,
      orderBy: { updatedAt: "asc" },
      select: {
        id: true,
        orderNumber: true,
        customerName: true,
        status: true,
        quantity: true,
        garmentType: true,
        printMethod: true,
        depositPaidAt: true,
        updatedAt: true,
        lineItems: { take: 8, select: { description: true, quantity: true } },
      },
    });

    const pending = [];
    const failed = [];
    const passed = [];

    for (const o of orders) {
      const ex = qcEngine.getQcBoardExtras(o.id, o.status);
      const card = {
        id: o.id,
        orderNumber: o.orderNumber,
        customerName: o.customerName,
        status: o.status,
        depositPaidAt: o.depositPaidAt,
        updatedAt: o.updatedAt,
        lineSummary:
          o.lineItems && o.lineItems.length
            ? o.lineItems
                .map((li) => `${String(li.description || "").slice(0, 60)} ×${li.quantity || 1}`)
                .join("; ")
                .slice(0, 400)
            : [o.garmentType, o.printMethod].filter(Boolean).join(" · ") || null,
        ...ex,
      };
      if (ex.qcFailed || (ex.needsReprint && String(o.status) === "QC")) {
        failed.push(card);
        continue;
      }
      if (ex.qcPassed) {
        passed.push(card);
        continue;
      }
      pending.push(card);
    }

    return res.status(200).json({
      ok: true,
      pending,
      failed,
      passed,
      metrics: {
        pending: pending.length,
        failed: failed.length,
        passed: passed.length,
      },
      snapshot: qcEngine.ownerQcSnapshot(),
      timestamp: new Date().toISOString(),
    });
  } catch (e) {
    return res.status(200).json({
      ok: false,
      error: e instanceof Error ? e.message : String(e),
      pending: [],
      failed: [],
      passed: [],
      timestamp: new Date().toISOString(),
    });
  }
});

router.get("/:orderId", async (req, res) => {
  try {
    const orderId = String(req.params.orderId || "").trim();
    const runMeta = await qcEngine.runQualityCheck(orderId);
    const detail = await qcEngine.getQcDetail(orderId);
    if (!detail.ok) {
      return res.status(200).json({ ok: false, runQualityCheck: runMeta, ...detail });
    }
    return res.status(200).json({ ok: true, runQualityCheck: runMeta, ...detail });
  } catch (e) {
    return res.status(200).json({
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    });
  }
});

router.post("/:orderId", async (req, res) => {
  try {
    const orderId = String(req.params.orderId || "").trim();
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const out = await qcEngine.submitQualityCheck(orderId, body);
    if (!out.ok) return res.status(200).json(out);
    const detail = await qcEngine.getQcDetail(orderId);
    return res.status(200).json({ ok: true, result: out, ...detail });
  } catch (e) {
    return res.status(200).json({
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    });
  }
});

module.exports = router;
