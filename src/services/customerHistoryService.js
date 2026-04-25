"use strict";

const { getPrisma } = require("./decisionEngine");

async function getCustomerHistory() {
  const prisma = getPrisma();
  if (!prisma) return [];

  const orders = await prisma.order.findMany({
    orderBy: { createdAt: "desc" },
    take: 5000,
  });

  const grouped = {};

  for (const order of orders || []) {
    const key =
      (order && order.email) ||
      (order && order.phone) ||
      (order && order.customerName) ||
      "UNKNOWN";

    if (!grouped[key]) {
      grouped[key] = {
        customerKey: key,
        customerName: (order && order.customerName) || "Unknown",
        email: (order && order.email) || null,
        phone: (order && order.phone) || null,
        totalOrders: 0,
        orders: [],
      };
    }

    grouped[key].totalOrders += 1;
    grouped[key].orders.push(order);
  }

  return Object.values(grouped).sort((a, b) => Number(b.totalOrders || 0) - Number(a.totalOrders || 0));
}

// [CHEEKY-GATE] CHEEKY_getCustomerOrders — extracted from GET /api/customers/:key/orders.
async function CHEEKY_getCustomerOrders(key) {
  const prisma = getPrisma();
  if (!prisma) return { success: false, error: "Database unavailable", code: "DB_UNAVAILABLE", data: null };
  const orders = await prisma.order.findMany({
    where: { OR: [{ email: key }, { phone: key }, { customerName: key }] },
    orderBy: { createdAt: "desc" },
    include: { lineItems: true },
    take: 200,
  });
  return { success: true, data: orders };
}

module.exports = { getCustomerHistory, CHEEKY_getCustomerOrders };
