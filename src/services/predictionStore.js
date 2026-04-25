"use strict";

const { getPrisma } = require("./decisionEngine");
const { generatePredictions } = require("./predictionService");

async function refreshPredictions() {
  const prisma = getPrisma();
  if (!prisma) throw new Error("DB_UNAVAILABLE");

  const list = await generatePredictions();
  await prisma.prediction.deleteMany({});

  for (const p of list) {
    await prisma.prediction.create({
      data: p,
    });
  }

  console.log("[PREDICTIONS] Updated:", list.length);
}

async function getUpcomingPredictions() {
  const prisma = getPrisma();
  if (!prisma) throw new Error("DB_UNAVAILABLE");

  const now = new Date();
  return prisma.prediction.findMany({
    where: {
      predictedDate: {
        lte: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
      },
    },
    orderBy: { predictedDate: "asc" },
    take: 200,
  });
}

module.exports = {
  refreshPredictions,
  getUpcomingPredictions,
};
