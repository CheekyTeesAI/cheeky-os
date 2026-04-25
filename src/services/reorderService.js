"use strict";

const crypto = require("crypto");
const { getPrisma } = require("./decisionEngine");
const { generatePortalToken } = require("./portalTokenService");

function fallbackEmail(original) {
  const raw = `${original && original.id ? original.id : "repeat"}:${Date.now()}`;
  const h = crypto.createHash("sha256").update(raw).digest("hex").slice(0, 20);
  return `reorder-${h}@cheeky-intake.local`;
}

async function createReorderFromOrder(orderId) {
  const prisma = getPrisma();
  if (!prisma) throw new Error("DB_UNAVAILABLE");

  const original = await prisma.order.findUnique({
    where: { id: String(orderId || "") },
    include: {
      lineItems: true,
      artFiles: true,
    },
  });

  if (!original) throw new Error("ORDER_NOT_FOUND");

  const newOrder = await prisma.order.create({
    data: {
      customerId: original.customerId || null,
      customerName: original.customerName || "Repeat Customer",
      email: original.email || fallbackEmail(original),
      phone: original.phone || null,
      notes: `Reorder from ${original.id}`,
      status: "INTAKE",
      portalToken: generatePortalToken(),
      portalEnabled: true,
      depositPaid: false,
      garmentsOrdered: false,
      garmentsReceived: false,
      productionComplete: false,
      qcComplete: false,
      nextAction: "Collect deposit",
      nextOwner: "Cheeky",
      blockedReason: "WAITING_ON_DEPOSIT",
      printMethod: original.printMethod || null,
      quantity: original.quantity || 1,
      totalAmount: 0,
      source: "reorder",
      lineItems: {
        create: (original.lineItems || []).map((item) => ({
          description: item.description || "Reorder item",
          quantity: Number(item.quantity || 0) || 1,
          unitPrice: Number(item.unitPrice || 0) || 0,
          productionType: item.productionType || null,
        })),
      },
    },
    include: { lineItems: true },
  });

  return newOrder;
}

/**
 * Reorder hints + candidate job search (read-only, conservative).
 */
const { getOperatingSystemJobs } = require("./foundationJobMerge");

function norm(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function scoreJob(job, email, phone, name) {
  let sc = 0;
  const je = norm(job && (job.fromEmail || job.email || ""));
  const jc = norm(job && (job.customer || job.customerName || ""));
  const em = norm(email);
  const ph = String(phone || "").replace(/\D/g, "");
  const jph = String((job && job.phone) || "").replace(/\D/g, "");
  if (em && je && (je.includes(em) || em.includes(je.split("@")[0]))) sc += 0.5;
  if (ph && ph.length >= 10 && jph && jph.includes(ph.slice(-10))) sc += 0.4;
  if (name && jc && (jc.includes(norm(name)) || norm(name).includes(jc))) sc += 0.35;
  return Math.min(1, sc);
}

async function detectReorderIntent(intakeRecord) {
  const ex = (intakeRecord && intakeRecord.extractedData) || {};
  const text =
    `${intakeRecord.rawSubject || ""} ${intakeRecord.rawBody || ""} ${ex.notes || ""}`.toLowerCase();
  const reorderDetected =
    Boolean(ex.reorderHints) ||
    /\bre-?order\b|\bsame\s+as\s+last\b|\brepeat\b|\blast\s+time\b|\blike\s+before\b/i.test(text);

  let candidateJobs = [];
  let confidence = reorderDetected ? 0.35 : 0;

  try {
    const jobs = await getOperatingSystemJobs();
    const list = Array.isArray(jobs) ? jobs : [];
    const ranked = list
      .map((j) => ({
        jobId: j.jobId,
        customer: j.customer || j.customerName,
        score: scoreJob(j, ex.email, ex.phone, ex.customerName),
      }))
      .filter((x) => x.score > 0.25)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8);
    candidateJobs = ranked;
    if (ranked.length && ranked[0].score >= 0.65) confidence = Math.max(confidence, ranked[0].score);
  } catch (_e) {
    candidateJobs = [];
  }

  return {
    reorderDetected,
    candidateJobs,
    confidence,
  };
}

module.exports = { createReorderFromOrder, detectReorderIntent };
