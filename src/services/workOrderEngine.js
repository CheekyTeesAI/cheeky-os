"use strict";

const { getPrisma } = require("./decisionEngine");

async function getJobPacket(orderId) {
  const id = String(orderId || "").trim();
  if (!id) {
    return { success: false, error: "orderId required", code: "VALIDATION_ERROR" };
  }
  const prisma = getPrisma();
  if (!prisma) {
    return { success: false, error: "Database unavailable", code: "DB_UNAVAILABLE" };
  }
  try {
    const order = await prisma.order.findUnique({
      where: { id },
      include: {
        customer: true,
        lineItems: true,
        artFiles: true,
        tasks: true,
        job: { include: { tasks: true } },
        productionRoute: true,
        vendorOrders: true,
      },
    });
    if (!order) {
      return { success: false, error: "Order not found", code: "NOT_FOUND" };
    }
    return {
      success: true,
      data: {
        packet: {
          order,
          generatedAt: new Date().toISOString(),
        },
      },
    };
  } catch (e) {
    console.error("[workOrderEngine.getJobPacket]", e && e.stack ? e.stack : e);
    return { success: false, error: e && e.message ? e.message : "load_failed", code: "LOAD_FAILED" };
  }
}

module.exports = {
  getJobPacket,
};
