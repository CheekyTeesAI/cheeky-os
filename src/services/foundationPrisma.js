const path = require("path");
const fs = require("fs");

/** Default SQLite path when FOUNDATION_DATABASE_URL unset (cwd = email-intake when running cheeky-os). */
if (!process.env.FOUNDATION_DATABASE_URL) {
  const candidates = [
    path.join(process.cwd(), "prisma-foundation", "data", "foundation.db"),
    path.join(process.cwd(), "email-intake", "prisma-foundation", "data", "foundation.db"),
  ];
  const resolved = candidates.find((p) => fs.existsSync(p)) || candidates[0];
  process.env.FOUNDATION_DATABASE_URL = "file:" + resolved.replace(/\\/g, "/");
}

let _client = null;
let _unavailable = false;

function getFoundationPrisma() {
  if (_unavailable) return null;
  if (_client) return _client;
  try {
    const mod = require(path.join(__dirname, "../generated/foundation-client"));
    _client = new mod.PrismaClient({
      log: process.env.FOUNDATION_PRISMA_LOG === "1" ? ["warn", "error"] : [],
    });
    return _client;
  } catch (e) {
    console.warn("[foundationPrisma] client unavailable — run: npx prisma generate --schema email-intake/prisma-foundation/schema.prisma", e && e.message ? e.message : e);
    _unavailable = true;
    return null;
  }
}

function isFoundationDbAvailable() {
  return getFoundationPrisma() != null;
}

async function disconnectFoundation() {
  if (_client && typeof _client.$disconnect === "function") {
    await _client.$disconnect();
    _client = null;
  }
}

module.exports = {
  getFoundationPrisma,
  isFoundationDbAvailable,
  disconnectFoundation,
};
