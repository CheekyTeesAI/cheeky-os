"use strict";

const { getPrisma } = require("./decisionEngine");

async function runSelfHeal() {
  const prisma = getPrisma();
  if (!prisma) {
    console.log("[SELF HEAL ERROR] DB_UNAVAILABLE");
    return;
  }

  try {
    console.log("[SELF HEAL] Running...");

    // 1) Repair orders with blank status values.
    const brokenOrders = await prisma.order.findMany({
      where: {
        OR: [{ status: "" }, { status: "UNKNOWN" }],
      },
      select: { id: true },
      take: 200,
    });

    for (const o of brokenOrders) {
      await prisma.order.update({
        where: { id: o.id },
        data: {
          status: "INTAKE",
          nextAction: "Review order",
          nextOwner: "Cheeky",
        },
      });
      console.log("[FIX] Order status repaired", o.id);
    }

    // 2) Ensure production jobs exist for paid orders.
    const paidOrders = await prisma.order.findMany({
      where: {
        depositPaid: true,
        productionComplete: false,
      },
      select: { id: true },
      take: 1000,
    });

    for (const o of paidOrders) {
      const job = await prisma.productionJob.findFirst({
        where: { orderId: o.id },
        select: { id: true },
      });

      if (!job) {
        await prisma.productionJob.create({
          data: {
            orderId: o.id,
            type: "IN_HOUSE",
            status: "READY",
            assignedTo: "Jeremy",
          },
        });
        console.log("[FIX] Missing job created", o.id);
      }
    }

    // 3) Unstick production jobs that are ready and garments are ready.
    const stuck = await prisma.productionJob.findMany({
      where: {
        status: "READY",
        garmentsReady: true,
      },
      select: { id: true },
      take: 500,
    });

    for (const j of stuck) {
      await prisma.productionJob.update({
        where: { id: j.id },
        data: { status: "PRINTING" },
      });
      console.log("[FIX] Job unstuck -> PRINTING", j.id);
    }

    console.log("[SELF HEAL] Complete");
  } catch (e) {
    console.log("[SELF HEAL ERROR]", e && e.message ? e.message : e);
  }
}

module.exports = { runSelfHeal };
