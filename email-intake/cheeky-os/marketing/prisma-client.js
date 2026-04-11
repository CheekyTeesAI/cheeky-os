let PrismaClientCtor = null;
try {
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
