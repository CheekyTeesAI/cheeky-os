"use strict";

const { getPrisma } = require("./decisionEngine");

const ALLOWED = new Set(["NEEDS_ART", "IN_PROGRESS", "READY_FOR_APPROVAL", "APPROVED"]);

async function createArt(orderId) {
  const prisma = getPrisma();
  if (!prisma) throw new Error("DB_UNAVAILABLE");

  return prisma.artFile.create({
    data: {
      orderId: String(orderId || ""),
      status: "NEEDS_ART",
      approvalStatus: "PENDING",
    },
  });
}

async function updateArtStatus(id, status) {
  const prisma = getPrisma();
  if (!prisma) throw new Error("DB_UNAVAILABLE");

  const next = String(status || "").toUpperCase();
  if (!ALLOWED.has(next)) throw new Error("INVALID_STATUS");

  const update = { status: next };
  if (next === "APPROVED") update.approvalStatus = "APPROVED";
  else if (next === "READY_FOR_APPROVAL") update.approvalStatus = "PENDING";

  return prisma.artFile.update({
    where: { id: String(id || "") },
    data: update,
  });
}

async function getArtQueue() {
  const prisma = getPrisma();
  if (!prisma) return [];

  return prisma.artFile.findMany({
    where: { status: { not: "APPROVED" } },
    include: { order: true },
    orderBy: { createdAt: "asc" },
    take: 500,
  });
}

module.exports = {
  createArt,
  updateArtStatus,
  getArtQueue,
};
