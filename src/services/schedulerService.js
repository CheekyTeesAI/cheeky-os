"use strict";

const { getPrisma } = require("./decisionEngine");

const DAILY_CAPACITY_HOURS = 8;

function dayKey(d) {
  return new Date(d).toISOString().split("T")[0];
}

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

async function autoScheduleJobs() {
  const prisma = getPrisma();
  if (!prisma) return { assigned: 0 };

  const scheduleMap = {};
  const today = startOfToday();

  // Seed map with already scheduled non-complete jobs to avoid overbooking.
  const existing = await prisma.productionJob.findMany({
    where: {
      scheduledDate: { not: null },
      status: { not: "COMPLETE" },
    },
    select: { scheduledDate: true, estimatedHours: true },
    take: 5000,
  });
  for (const job of existing || []) {
    if (!job.scheduledDate) continue;
    const key = dayKey(job.scheduledDate);
    const hours = Number(job.estimatedHours || 1) || 1;
    scheduleMap[key] = (scheduleMap[key] || 0) + hours;
  }

  const jobs = await prisma.productionJob.findMany({
    where: {
      scheduledDate: null,
      status: { not: "COMPLETE" },
    },
    orderBy: [{ priorityLevel: "desc" }, { createdAt: "asc" }],
    take: 2000,
  });

  let assigned = 0;

  for (const job of jobs || []) {
    const hours = Number(job.estimatedHours || 1) || 1;
    const day = new Date(today);

    while (true) {
      const key = dayKey(day);
      if (!scheduleMap[key]) scheduleMap[key] = 0;

      if (scheduleMap[key] + hours <= DAILY_CAPACITY_HOURS) {
        scheduleMap[key] += hours;
        await prisma.productionJob.update({
          where: { id: job.id },
          data: { scheduledDate: new Date(day) },
        });
        assigned += 1;
        break;
      }
      day.setDate(day.getDate() + 1);
    }
  }

  return { assigned };
}

async function getTodayJobs() {
  const prisma = getPrisma();
  if (!prisma) return [];

  const today = startOfToday();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);

  return prisma.productionJob.findMany({
    where: {
      scheduledDate: {
        gte: today,
        lt: tomorrow,
      },
    },
    orderBy: [{ priorityLevel: "desc" }, { createdAt: "asc" }],
    take: 1000,
  });
}

module.exports = {
  autoScheduleJobs,
  getTodayJobs,
};
