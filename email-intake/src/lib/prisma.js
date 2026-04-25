"use strict";

// AUDIT SUMMARY (KILLSHOT v3.1)
// - Entrypoint verified: email-intake/cheeky-os/server.js (and root render-http.js wrapper)
// - Prisma schema source verified: email-intake/prisma/schema.prisma
// - Purpose: shared singleton Prisma client for new hardening modules

let prismaSingleton = null;

function getPrisma() {
  try {
    if (global.__CHEEKY_KILLSHOT_PRISMA__) {
      return global.__CHEEKY_KILLSHOT_PRISMA__;
    }
    if (!prismaSingleton) {
      const { PrismaClient } = require("@prisma/client");
      prismaSingleton = new PrismaClient();
    }
    global.__CHEEKY_KILLSHOT_PRISMA__ = prismaSingleton;
    return prismaSingleton;
  } catch (err) {
    console.error(
      "[PRISMA] singleton_init_failed | fail |",
      err && err.message ? err.message : String(err)
    );
    return null;
  }
}

module.exports = getPrisma();
module.exports.getPrisma = getPrisma;
