"use strict";

/** Shared Prisma loaders for cockpit drafts — read-only, no mutations. */

const path = require("path");

function getPrisma() {
  try {
    return require(path.join(__dirname, "..", "..", "src", "lib", "prisma"));
  } catch (_e) {
    return null;
  }
}

/**
 * @param {string} orderId
 * @returns {Promise<object|null>}
 */
async function loadOrderById(orderId) {
  const prisma = getPrisma();
  if (!prisma || !prisma.order || !orderId) return null;
  try {
    return await prisma.order.findFirst({
      where: { id: String(orderId), deletedAt: null },
    });
  } catch (_e) {
    return null;
  }
}

/**
 * @param {number} limit
 * @returns {Promise<object[]>}
 */
async function loadOrdersForDrafts(limit) {
  const prisma = getPrisma();
  const take = Math.min(500, Math.max(1, Number(limit) || 400));
  if (!prisma || !prisma.order) return [];
  try {
    return await prisma.order.findMany({
      where: { deletedAt: null },
      orderBy: { updatedAt: "desc" },
      take,
    });
  } catch (_e) {
    return [];
  }
}

function daysBetween(a, b) {
  try {
    const da = a instanceof Date ? a : new Date(a);
    const db = b instanceof Date ? b : new Date(b);
    return Math.floor((db - da) / 86400000);
  } catch (_e) {
    return 0;
  }
}

module.exports = {
  getPrisma,
  loadOrderById,
  loadOrdersForDrafts,
  daysBetween,
};
