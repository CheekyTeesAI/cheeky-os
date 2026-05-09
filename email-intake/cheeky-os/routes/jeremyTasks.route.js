"use strict";

const path = require("path");
const { computeStuckReasons } = require("../services/operatorStuckReasons");

function getPrisma() {
  try {
    return require(path.join(__dirname, "..", "..", "src", "lib", "prisma"));
  } catch (_e) {
    return null;
  }
}

const JEREMY_NAME = String(process.env.CHEEKY_JEREMY_NAME || "Jeremy").trim() || "Jeremy";

function priorityRank(p) {
  const u = String(p || "").toUpperCase();
  if (u === "HIGH" || u === "RUSH") return 0;
  if (u === "LOW") return 2;
  return 1;
}

/**
 * @param {import("express").Application} app
 */
function mountJeremyTasks(app) {
  app.get("/api/jeremy/tasks", async (_req, res) => {
    try {
      if (String(process.env.CHEEKY_JEREMY_VIEW_ENABLED || "true").toLowerCase() === "false") {
        return res.status(403).json({
          ok: false,
          error: "jeremy_view_disabled",
          tasks: [],
          counts: { ready: 0, printing: 0, qc: 0, stuck: 0 },
        });
      }

      const prisma = getPrisma();
      if (!prisma || !prisma.order) {
        return res.status(503).json({
          ok: false,
          error: "database_unavailable",
          tasks: [],
          counts: { ready: 0, printing: 0, qc: 0, stuck: 0 },
        });
      }

      const rows = await prisma.order.findMany({
        where: {
          deletedAt: null,
          depositPaidAt: { not: null },
          status: { in: ["PRODUCTION_READY", "PRINTING", "QC"] },
        },
        take: 300,
        include: {
          artFiles: { select: { id: true, approvalStatus: true } },
          vendorOrders: { take: 8, select: { id: true, status: true } },
          lineItems: {
            take: 14,
            select: { description: true, quantity: true, productionType: true },
          },
        },
      });

      /** @type {typeof rows} */
      const filtered = rows.filter((o) => {
        const assigned = String(o.assignedProductionTo || "").trim();
        const unassigned = !assigned;
        const mine = assigned.toLowerCase() === JEREMY_NAME.toLowerCase();
        return mine || unassigned;
      });

      const tasks = filtered.map((o) => {
        const stuckReasons = computeStuckReasons(o);
        const hasStuck = stuckReasons.length > 0;
        const lineParts = (o.lineItems || []).map((i) => {
          const d = i.description || "";
          const q = i.quantity != null ? i.quantity : "?";
          return String(d).slice(0, 60) + " ×" + q;
        });
        return {
          orderId: o.id,
          customerName: o.customerName || "—",
          orderTitle: o.orderNumber || (o.notes && String(o.notes).slice(0, 80)) || "—",
          stage: o.status,
          nextAction: o.nextAction || "—",
          priority: o.operatorProductionPriority || "NORMAL",
          productionType: o.productionTypeFinal || o.printMethod || "—",
          product: o.garmentType || lineParts[0] || "—",
          color: "—",
          quantitiesSummary:
            o.quantity != null
              ? String(o.quantity)
              : lineParts.length
                ? lineParts.join("; ").slice(0, 200)
                : "—",
          dueDate: o.quoteExpiresAt || null,
          note: o.operatorProductionNote || "",
          stuckReasons,
          _hasStuck: hasStuck,
          _priorityRank: priorityRank(o.operatorProductionPriority),
          _updatedAt: o.updatedAt ? new Date(o.updatedAt).getTime() : 0,
          _due: o.quoteExpiresAt ? new Date(o.quoteExpiresAt).getTime() : Infinity,
        };
      });

      const now = Date.now();
      tasks.sort((a, b) => {
        if (a._hasStuck !== b._hasStuck) return a._hasStuck ? -1 : 1;
        const odA = a.dueDate && new Date(a.dueDate).getTime() < now;
        const odB = b.dueDate && new Date(b.dueDate).getTime() < now;
        if (odA !== odB) return odA ? -1 : 1;
        if (a._priorityRank !== b._priorityRank) return a._priorityRank - b._priorityRank;
        return a._updatedAt - b._updatedAt;
      });

      const cleaned = tasks.map((t) => {
        const { _hasStuck, _priorityRank, _updatedAt, _due, ...rest } = t;
        return rest;
      });

      let ready = 0;
      let printing = 0;
      let qc = 0;
      let stuck = 0;
      for (const t of cleaned) {
        const s = String(t.stage || "").toUpperCase();
        if (s === "PRODUCTION_READY") ready += 1;
        else if (s === "PRINTING") printing += 1;
        else if (s === "QC") qc += 1;
        if (t.stuckReasons && t.stuckReasons.length) stuck += 1;
      }

      return res.json({
        ok: true,
        date: new Date().toISOString().slice(0, 10),
        tasks: cleaned,
        counts: { ready, printing, qc, stuck },
      });
    } catch (e) {
      console.error("[jeremy/tasks]", e && e.message ? e.message : e);
      return res.status(500).json({
        ok: false,
        error: e && e.message ? e.message : String(e),
        tasks: [],
        counts: { ready: 0, printing: 0, qc: 0, stuck: 0 },
      });
    }
  });

  /** Live Prisma Task rows (PENDING / IN_PROGRESS / COMPLETE) for staff tools */
  app.get("/api/staff/prisma-tasks", async (_req, res) => {
    try {
      const prisma = getPrisma();
      if (!prisma || !prisma.task) {
        return res.status(503).json({ ok: false, error: "database_unavailable", tasks: [] });
      }
      const rows = await prisma.task.findMany({
        where: {
          status: { in: ["PENDING", "IN_PROGRESS", "DONE", "COMPLETE"] },
        },
        orderBy: { updatedAt: "desc" },
        take: 200,
        select: {
          id: true,
          title: true,
          type: true,
          status: true,
          orderId: true,
          jobId: true,
          assignedTo: true,
          updatedAt: true,
          order: { select: { customerName: true, status: true, email: true } },
        },
      });
      return res.json({ ok: true, tasks: rows, count: rows.length });
    } catch (e) {
      console.error("[staff/prisma-tasks]", e && e.message ? e.message : e);
      return res.status(500).json({
        ok: false,
        error: e && e.message ? e.message : String(e),
        tasks: [],
      });
    }
  });
}

module.exports = { mountJeremyTasks, JEREMY_NAME };
