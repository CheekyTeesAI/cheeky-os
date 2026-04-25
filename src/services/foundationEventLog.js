const { getFoundationPrisma } = require("./foundationPrisma");

async function logEvent(jobId, type, message) {
  const prisma = getFoundationPrisma();
  if (!prisma) {
    console.log("[foundationEvent]", type, jobId || "-", message);
    return { success: false, mock: true, reason: "foundation_db_unavailable" };
  }
  try {
    let internalJobId = null;
    if (jobId) {
      const j = await prisma.foundationJob.findUnique({ where: { jobKey: String(jobId) } });
      internalJobId = j ? j.id : null;
    }
    const row = await prisma.foundationEventLog.create({
      data: {
        jobId: internalJobId,
        type: String(type || "EVENT"),
        message: String(message || ""),
      },
    });
    return { success: true, id: row.id };
  } catch (e) {
    console.warn("[foundationEvent] log failed:", e && e.message ? e.message : e);
    return { success: false, error: e && e.message ? e.message : "log_failed" };
  }
}

module.exports = { logEvent };
