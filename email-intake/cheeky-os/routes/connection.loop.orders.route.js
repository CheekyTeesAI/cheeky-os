"use strict";



/**

 * Connection v1.2 — read/update single orders without replacing Power Apps GET / list.

 * Production mode: PATCH supports canonical `stage` (and legacy allowed fields).

 */



const express = require("express");

const path = require("path");



const router = express.Router();



const orderStageEngine = require(path.join(

  __dirname,

  "..",

  "services",

  "orderStageEngine"

));

const productionReadyTasks = require(path.join(

  __dirname,

  "..",

  "services",

  "productionReadyTasks.service"

));

const customerDraft = require(path.join(

  __dirname,

  "..",

  "services",

  "customerMessageDraft.service"

));

const selfFixService = require(path.join(__dirname, "..", "services", "selfFixService"));

const { computeStuckReasons } = require(path.join(__dirname, "..", "services", "operatorStuckReasons"));



function getPrisma() {

  try {

    return require(path.join(__dirname, "..", "..", "src", "lib", "prisma"));

  } catch (_) {

    return null;

  }

}



const PATCH_ALLOW = new Set([

  "notes",

  "customerName",

  "productionTypeFinal",

  "printMethod",

]);



router.post("/:id/art/request-approval", async (req, res) => {

  try {

    const prisma = getPrisma();

    if (!prisma) {

      return res.status(503).json({ ok: false, error: "database_unavailable" });

    }

    const orderId = req.params.id;

    const existing = await prisma.order.findFirst({

      where: { id: orderId, deletedAt: null },

    });

    if (!existing) {

      return res.status(404).json({ ok: false, error: "not_found" });

    }

    await prisma.order.update({

      where: { id: orderId },

      data: { artApprovalStatus: "REQUESTED", artApprovalNote: null },

    });

    const draft = await customerDraft.createCustomerMessageDraft(

      orderId,

      "ART_APPROVAL_REQUEST",

      "email"

    );

    try {

      if (selfFixService && typeof selfFixService.evaluateProductionReady === "function") {

        await selfFixService.evaluateProductionReady(orderId);

      }

    } catch (ev) {

      console.warn(

        "[art-gate] evaluateProductionReady:",

        ev && ev.message ? ev.message : ev

      );

    }

    return res.json({ ok: true, orderId, draft });

  } catch (e) {

    return res

      .status(500)

      .json({ ok: false, error: e && e.message ? e.message : String(e) });

  }

});



router.patch("/:id/art/approval", async (req, res) => {

  try {

    const prisma = getPrisma();

    if (!prisma) {

      return res.status(503).json({ ok: false, error: "database_unavailable" });

    }

    const orderId = req.params.id;

    const existing = await prisma.order.findFirst({

      where: { id: orderId, deletedAt: null },

    });

    if (!existing) {

      return res.status(404).json({ ok: false, error: "not_found" });

    }

    const body = req.body && typeof req.body === "object" ? req.body : {};

    const status = String(body.status || "")

      .trim()

      .toUpperCase();

    const note = typeof body.note === "string" ? body.note.trim() : "";

    if (!["APPROVED", "CHANGES_REQUESTED"].includes(status)) {

      return res.status(400).json({

        ok: false,

        error: "status must be APPROVED or CHANGES_REQUESTED",

      });

    }

    const data =

      status === "APPROVED"

        ? {

            artApprovalStatus: "APPROVED",

            artApprovedAt: new Date(),

            artApprovalNote: note || null,

          }

        : {

            artApprovalStatus: "CHANGES_REQUESTED",

            artApprovalNote: note || null,

            artApprovedAt: null,

          };

    await prisma.order.update({ where: { id: orderId }, data });

    try {

      if (selfFixService && typeof selfFixService.evaluateProductionReady === "function") {

        await selfFixService.evaluateProductionReady(orderId);

      }

    } catch (ev) {

      console.warn(

        "[art-gate] evaluateProductionReady:",

        ev && ev.message ? ev.message : ev

      );

    }

    const order = await prisma.order.findFirst({

      where: { id: orderId, deletedAt: null },

    });

    return res.json({ ok: true, order });

  } catch (e) {

    return res

      .status(500)

      .json({ ok: false, error: e && e.message ? e.message : String(e) });

  }

});



router.get("/:id", async (req, res, next) => {

  try {

    if (

      req.params.id === "" ||

      req.params.id === "favicon.ico" ||

      req.params.id.includes(".")

    ) {

      return next();

    }

    const prisma = getPrisma();

    if (!prisma) {

      return res.status(503).json({ ok: false, error: "database_unavailable" });

    }

    const order = await prisma.order.findFirst({

      where: { id: req.params.id, deletedAt: null },

    });

    if (!order) {

      return res.status(404).json({ ok: false, error: "not_found" });

    }

    return res.json({ ok: true, order });

  } catch (e) {

    return res

      .status(500)

      .json({ ok: false, error: e && e.message ? e.message : String(e) });

  }

});


router.patch("/:id/assign", async (req, res) => {
  try {
    const prisma = getPrisma();
    if (!prisma) {
      return res.status(503).json({ ok: false, error: "database_unavailable" });
    }
    const orderId = req.params.id;
    const existing = await prisma.order.findFirst({
      where: { id: orderId, deletedAt: null },
      include: {
        artFiles: { select: { id: true, approvalStatus: true } },
        vendorOrders: { take: 8, select: { id: true, status: true } },
        lineItems: {
          take: 12,
          select: { description: true, quantity: true, productionType: true },
        },
      },
    });
    if (!existing) {
      return res.status(404).json({ ok: false, error: "not_found" });
    }
    if (!existing.depositPaidAt) {
      return res.status(400).json({ ok: false, error: "cash_gate: depositPaidAt required" });
    }
    const st = String(existing.status || "").toUpperCase().trim();
    const assignable = new Set(["PRODUCTION_READY", "PRINTING", "QC"]);
    if (!assignable.has(st)) {
      return res.status(400).json({
        ok: false,
        error: "assignment allowed only for PRODUCTION_READY, PRINTING, or QC",
      });
    }
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const assignedTo = typeof body.assignedTo === "string" ? body.assignedTo.trim() : "";
    const nextAction = typeof body.nextAction === "string" ? body.nextAction.trim() : "";
    if (!assignedTo || !nextAction) {
      return res.status(400).json({ ok: false, error: "assignedTo and nextAction required" });
    }
    const assignedRole =
      typeof body.assignedRole === "string" && body.assignedRole.trim()
        ? body.assignedRole.trim()
        : null;
    const priorityRaw =
      typeof body.priority === "string" && body.priority.trim()
        ? body.priority.trim()
        : "NORMAL";
    const note = typeof body.note === "string" ? body.note.trim() : "";
    let opNote = existing.operatorProductionNote ? String(existing.operatorProductionNote) : "";
    if (note) {
      opNote = opNote + (opNote ? "\n" : "") + "[assign " + new Date().toISOString() + "] " + note;
    }
    const data = {
      assignedProductionTo: assignedTo,
      nextAction,
      operatorAssignedRole: assignedRole,
      operatorProductionPriority: priorityRaw,
    };
    if (note) {
      data.operatorProductionNote = opNote;
    }
    try {
      await prisma.order.update({ where: { id: orderId }, data });
    } catch (pe) {
      const msg = pe && pe.message ? pe.message : String(pe);
      if (/Unknown arg|does not exist|column/i.test(msg)) {
        await prisma.order.update({
          where: { id: orderId },
          data: { assignedProductionTo: assignedTo, nextAction },
        });
      } else {
        throw pe;
      }
    }
    console.log(
      "[flow] ORDER ASSIGNED orderId=" + orderId + " assignedTo=" + assignedTo + " nextAction=" + nextAction
    );
    return res.json({ ok: true, orderId: orderId, assignedTo: assignedTo, nextAction: nextAction });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e && e.message ? e.message : String(e) });
  }
});


router.patch("/:id/stage", async (req, res) => {

  try {

    const prisma = getPrisma();

    if (!prisma) {

      return res.status(503).json({ ok: false, error: "database_unavailable" });

    }

    const orderId = req.params.id;

    const existing = await prisma.order.findFirst({

      where: { id: orderId, deletedAt: null },

      include: {

        artFiles: { select: { id: true, approvalStatus: true } },

        vendorOrders: { take: 8, select: { id: true, status: true } },

        lineItems: {

          take: 12,

          select: { description: true, quantity: true, productionType: true },

        },

      },

    });

    if (!existing) {

      return res.status(404).json({ ok: false, error: "not_found" });

    }

    const body = req.body && typeof req.body === "object" ? req.body : {};

    const stageRaw =

      typeof body.stage === "string" && body.stage.trim()

        ? body.stage.trim()

        : null;

    if (!stageRaw) {

      return res.status(400).json({ ok: false, error: "stage is required" });

    }

    const target = orderStageEngine.normalizeStage(stageRaw);

    const allowedHere = new Set(["PRINTING", "QC", "COMPLETED"]);

    if (!allowedHere.has(target)) {

      return res.status(400).json({

        ok: false,

        error: "stage must be one of: PRINTING, QC, COMPLETED",

      });

    }

    const fromSt = String(existing.status || "").toUpperCase().trim();

    const gate = orderStageEngine.assertOperatorStageTransition(

      fromSt,

      target,

      Object.assign({}, existing, {
        isDepositWaived: existing.isDepositWaived === true || body.isDepositWaived === true,
      })

    );

    if (!gate.ok) {

      return res.status(400).json({ ok: false, error: gate.reason || "transition_blocked" });

    }

    const stuckReasons = computeStuckReasons(existing);

    const ownerAck = String(process.env.CHEEKY_OWNER_STAGE_ACK || "").trim();

    const bodyAck =

      typeof body.ownerStageAck === "string" ? body.ownerStageAck.trim() : "";

    const ownerOk = ownerAck !== "" && bodyAck === ownerAck;

    if (target === "PRINTING" && stuckReasons.length > 0 && !ownerOk) {

      return res.status(400).json({

        ok: false,

        error: "stuck_reasons_block_printing — ask Patrick or set ownerStageAck",

        stuckReasons,

      });

    }

    if (target === "COMPLETED") {

      const qcGate = require(path.join(__dirname, "..", "services", "qcGate.service"));

      const qg = await qcGate.assertMayCompleteOrder(orderId);

      if (!qg.ok) {

        return res.status(400).json({ ok: false, error: qg.error, qc: qg.detail });

      }

    }

    orderStageEngine.logStageChange(

      orderId,

      existing.status,

      target,

      (body.requestedBy && String(body.requestedBy)) || "operator-stage-api"

    );

    const note = typeof body.note === "string" ? body.note.trim() : "";

    const data = { status: target };

    if (target === "PRINTING" && !existing.productionStartedAt) {

      data.productionStartedAt = new Date();

    }

    if (target === "COMPLETED" && !existing.productionCompletedAt) {

      data.productionCompletedAt = new Date();

    }

    if (note) {

      const prev = String(existing.notes || "");

      data.notes =

        prev +

        (prev ? "\n" : "") +

        "[stage " +

        new Date().toISOString() +

        "] " +

        note;

    }

    await prisma.order.update({

      where: { id: orderId },

      data,

    });

    if (target === "COMPLETED") {

      try {

        const qcGateDone = require(path.join(__dirname, "..", "services", "qcGate.service"));

        qcGateDone.onOrderMarkedCompleted(orderId);

      } catch (_qcDone) {

        /* non-fatal */

      }

    }

    if (target === "PRINTING") {

      try {

        await customerDraft.createCustomerMessageDraft(orderId, "PRODUCTION_STARTED", "email");

      } catch (de) {

        console.warn(

          "[connection-loop] production_started draft:",

          de && de.message ? de.message : de

        );

      }

    }

    if (target === "COMPLETED") {

      try {

        await customerDraft.createCustomerMessageDraft(orderId, "READY_FOR_PICKUP", "email");

        const fresh = await prisma.order.findFirst({ where: { id: orderId } });

        if (fresh) {

          const total =

            Number(fresh.totalAmount ?? fresh.quotedAmount ?? fresh.total ?? 0) || 0;

          const paid = Number(fresh.amountPaid ?? 0) || 0;

          if (total - paid > 0.01) {

            await customerDraft.createCustomerMessageDraft(orderId, "BALANCE_DUE", "email");

          }

        }

      } catch (de) {

        console.warn(

          "[connection-loop] completed comm drafts:",

          de && de.message ? de.message : de

        );

      }

    }

    console.log("[flow] JEREMY ACTION orderId=" + orderId + " action=" + target);

    console.log(

      "[flow] STAGE UPDATED orderId=" +

        orderId +

        " from=" +

        fromSt +

        " to=" +

        target

    );

    return res.json({ ok: true, orderId: orderId, from: fromSt, to: target });

  } catch (e) {

    return res

      .status(500)

      .json({ ok: false, error: e && e.message ? e.message : String(e) });

  }

});



router.patch("/:id", async (req, res) => {

  try {

    const prisma = getPrisma();

    if (!prisma) {

      return res.status(503).json({ ok: false, error: "database_unavailable" });

    }

    const existing = await prisma.order.findFirst({

      where: { id: req.params.id, deletedAt: null },

    });

    if (!existing) {

      return res.status(404).json({ ok: false, error: "not_found" });

    }

    const body = req.body && typeof req.body === "object" ? req.body : {};



    const stageRaw =

      typeof body.stage === "string" && body.stage.trim()

        ? body.stage.trim()

        : typeof body.status === "string" && body.status.trim()

          ? body.status.trim()

          : null;



    if (stageRaw) {

      const target = orderStageEngine.normalizeStage(stageRaw);

      const fromSt = String(existing.status || "").toUpperCase().trim();

      const gate = orderStageEngine.assertOperatorStageTransition(

        fromSt,

        target,

        Object.assign({}, existing, {
          isDepositWaived: existing.isDepositWaived === true || body.isDepositWaived === true,
        })

      );

      if (!gate.ok) {

        return res.status(400).json({ ok: false, error: gate.reason || "transition_blocked" });

      }

      if (target === "COMPLETED") {

        const qcGatePatch = require(path.join(__dirname, "..", "services", "qcGate.service"));

        const qgx = await qcGatePatch.assertMayCompleteOrder(req.params.id);

        if (!qgx.ok) {

          return res.status(400).json({ ok: false, error: qgx.error, qc: qgx.detail });

        }

      }

      orderStageEngine.logStageChange(

        req.params.id,

        existing.status,

        target,

        (body.requestedBy && String(body.requestedBy)) || "operator"

      );

      const updated = await prisma.order.update({

        where: { id: req.params.id },

        data: { status: target },

      });

      if (target === "COMPLETED") {

        try {

          const qcGateDone2 = require(path.join(__dirname, "..", "services", "qcGate.service"));

          qcGateDone2.onOrderMarkedCompleted(req.params.id);

        } catch (_qcd) {

          /* non-fatal */

        }

      }

      if (target === "PRODUCTION_READY") {

        try {

          await productionReadyTasks.ensureMinimalProductionTasks(req.params.id);

        } catch (te) {

          console.warn("[connection-loop] production tasks:", te && te.message ? te.message : te);

        }

        try {

          await customerDraft.persistDraftMessage(

            req.params.id,

            "PRODUCTION_READY",

            "email"

          );

        } catch (de) {

          console.warn("[connection-loop] draft comm:", de && de.message ? de.message : de);

        }

      }

      console.log("[connection-loop] ORDER_STAGE_PATCH id=" + req.params.id + " stage=" + target);

      return res.json({ ok: true, order: updated });

    }



    const data = {};

    for (const k of Object.keys(body)) {

      if (PATCH_ALLOW.has(k) && typeof body[k] === "string") {

        data[k] = body[k];

      }

    }

    if (Object.keys(data).length === 0) {

      return res.status(400).json({ ok: false, error: "no_allowed_fields" });

    }

    const order = await prisma.order.update({

      where: { id: req.params.id },

      data,

    });

    console.log("[connection-loop] ORDER_PATCHED id=" + req.params.id);

    return res.json({ ok: true, order });

  } catch (e) {

    return res

      .status(500)

      .json({ ok: false, error: e && e.message ? e.message : String(e) });

  }

});


router.post("/:id/operator-note", async (req, res) => {
  try {
    const prisma = getPrisma();
    if (!prisma) {
      return res.status(503).json({ ok: false, error: "database_unavailable" });
    }
    const orderId = req.params.id;
    const existing = await prisma.order.findFirst({
      where: { id: orderId, deletedAt: null },
    });
    if (!existing) {
      return res.status(404).json({ ok: false, error: "not_found" });
    }
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const text = typeof body.text === "string" ? body.text.trim() : "";
    if (!text) {
      return res.status(400).json({ ok: false, error: "text required" });
    }
    const prev = String(existing.notes || "");
    const line = "[jeremy-note " + new Date().toISOString() + "] " + text;
    await prisma.order.update({
      where: { id: orderId },
      data: { notes: prev + (prev ? "\n" : "") + line },
    });
    console.log("[flow] JEREMY NOTE orderId=" + orderId);
    return res.json({ ok: true, orderId: orderId });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e && e.message ? e.message : String(e) });
  }
});


module.exports = router;

