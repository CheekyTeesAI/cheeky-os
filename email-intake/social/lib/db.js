"use strict";

/**
 * Reuses app Prisma instance from voice.run global bridge when available.
 */

function getDb() {
  const g = globalThis;
  if (g.__CHEEKY_PRISMA_SINGLETON__) {
    return g.__CHEEKY_PRISMA_SINGLETON__;
  }
  // Fallback: single process dev (should not happen if voice.run wired)
  const { PrismaClient } = require("@prisma/client");
  if (!g.__CHEEKY_PRISMA_SINGLETON__) {
    g.__CHEEKY_PRISMA_SINGLETON__ = new PrismaClient();
  }
  return g.__CHEEKY_PRISMA_SINGLETON__;
}

module.exports = { getDb };
