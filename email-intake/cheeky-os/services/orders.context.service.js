"use strict";

const path = require("path");

function getClient() {
  try {
    return require(path.join(__dirname, "..", "..", "src", "lib", "prisma"));
  } catch (_) {
    return null;
  }
}

const SELECT = {
  id: true,
  orderNumber: true,
  customerName: true,
  email: true,
  status: true,
  amountPaid: true,
  totalAmount: true,
  quotedAmount: true,
  depositStatus: true,
  depositReceived: true,
  productionTypeFinal: true,
  printMethod: true,
  garmentType: true,
  quantity: true,
  isRush: true,
  squareInvoiceId: true,
  updatedAt: true,
  createdAt: true,
};

/**
 * Operator-facing order buckets for connection loop visibility.
 * @returns {Promise<object>}
 */
async function buildOrdersContextBuckets() {
  const prisma = getClient();
  if (!prisma) {
    return { available: false, error: "prisma_unavailable" };
  }
  try {
    const [active, printing, needsAttention, recent] = await Promise.all([
      prisma.order.findMany({
        where: {
          deletedAt: null,
          status: {
            in: [
              "PRODUCTION_READY",
              "PRODUCTION",
              "INTAKE",
              "AWAITING_DEPOSIT",
              "QUOTE_READY",
              "APPROVED",
              "DEPOSIT_PAID",
            ],
          },
        },
        orderBy: { updatedAt: "desc" },
        take: 40,
        select: SELECT,
      }),
      prisma.order.findMany({
        where: {
          deletedAt: null,
          OR: [
            { status: { contains: "PRINT", mode: "insensitive" } },
            { status: "QC" },
            { status: "PRINTING" },
          ],
        },
        orderBy: { updatedAt: "desc" },
        take: 25,
        select: SELECT,
      }),
      prisma.order.findMany({
        where: {
          deletedAt: null,
          status: { in: ["AWAITING_DEPOSIT", "BLOCKED", "INTAKE"] },
        },
        orderBy: { updatedAt: "asc" },
        take: 30,
        select: SELECT,
      }),
      prisma.order.findMany({
        where: { deletedAt: null },
        orderBy: { createdAt: "desc" },
        take: 20,
        select: SELECT,
      }),
    ]);

    return {
      available: true,
      active,
      printing,
      needsAttention,
      recent,
    };
  } catch (e) {
    return {
      available: false,
      error: e && e.message ? String(e.message).slice(0, 240) : String(e),
    };
  }
}

module.exports = { buildOrdersContextBuckets };
