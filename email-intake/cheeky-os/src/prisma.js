"use strict";

const path = require("path");

function getPrisma() {
  const candidates = [
    path.join(__dirname, "..", "..", "..", "src", "services", "decisionEngine"),
    path.join(__dirname, "..", "..", "src", "services", "decisionEngine"),
  ];

  for (const candidate of candidates) {
    try {
      const decisionEngine = require(candidate);
      if (decisionEngine && typeof decisionEngine.getPrisma === "function") {
        const prisma = decisionEngine.getPrisma();
        if (prisma) return prisma;
      }
    } catch (_) {}
  }

  return null;
}

module.exports = getPrisma();
