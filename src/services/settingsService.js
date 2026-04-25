"use strict";

const { getPrisma } = require("./decisionEngine");

async function getSetting(key, defaultValue = null) {
  const prisma = getPrisma();
  if (!prisma) return defaultValue;

  const s = await prisma.setting.findUnique({
    where: { key: String(key || "") },
  });
  return s ? s.value : defaultValue;
}

async function setSetting(key, value) {
  const prisma = getPrisma();
  if (!prisma) throw new Error("DB_UNAVAILABLE");

  return prisma.setting.upsert({
    where: { key: String(key || "") },
    update: { value: String(value ?? "") },
    create: { key: String(key || ""), value: String(value ?? "") },
  });
}

async function getAllSettings() {
  const prisma = getPrisma();
  if (!prisma) throw new Error("DB_UNAVAILABLE");
  return prisma.setting.findMany({
    orderBy: { key: "asc" },
  });
}

module.exports = {
  getSetting,
  setSetting,
  getAllSettings,
};
