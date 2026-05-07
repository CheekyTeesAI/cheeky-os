let PrismaClientCtor = null;
try {
  const path = require("path");
  if (!String(process.env.CHEEKY_MARKETING_DATABASE_URL || "").trim()) {
    const dbFile = path.join(__dirname, "..", "prisma", "marketing.db");
    process.env.CHEEKY_MARKETING_DATABASE_URL = `file:${dbFile.replace(/\\/g, "/")}`;
  }
  ({ PrismaClient: PrismaClientCtor } = require("../generated/prisma-marketing"));
} catch {
  PrismaClientCtor = null;
}

let prisma = null;

function getPrisma() {
  if (!PrismaClientCtor) return null;
  if (!prisma) prisma = new PrismaClientCtor();
  return prisma;
}

module.exports = { getPrisma };
