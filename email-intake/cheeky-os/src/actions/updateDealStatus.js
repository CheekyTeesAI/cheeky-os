"use strict";

const prisma = require("../prisma");

module.exports = async function updateDealStatus(id, status) {
  try {
    if (!prisma) {
      return { success: false, error: "Prisma unavailable" };
    }
    if (!id) {
      return { success: false, message: "Missing id" };
    }

    const updated = await prisma.lead.update({
      where: { id },
      data: { dealStatus: status },
    });

    return {
      success: true,
      lead: updated,
    };
  } catch (err) {
    return {
      success: false,
      error: err && err.message ? err.message : String(err),
    };
  }
};
