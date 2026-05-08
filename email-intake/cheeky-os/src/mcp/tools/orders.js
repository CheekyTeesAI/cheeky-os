"use strict";

const prisma = require("../../../../src/lib/prisma");

function parseLimit(limit, fallback) {
  const n = Number(limit);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(Math.floor(n), 100);
}

async function getOrders(input) {
  try {
    if (!prisma || !prisma.order) {
      return { error: true, message: "Prisma Order model is unavailable." };
    }

    const limit = parseLimit(input && input.limit, 10);
    const status = input && typeof input.status === "string" ? input.status.trim() : "";

    const where = status ? { status } : {};
    const orders = await prisma.order.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    return { error: false, data: orders };
  } catch (err) {
    return { error: true, message: err && err.message ? err.message : String(err) };
  }
}

module.exports = {
  getOrders,
};
