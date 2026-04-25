"use strict";

const { getPrisma } = require("./decisionEngine");

function buildMessage(type, target) {
  if (type === "REORDER") {
    return `Hey ${target.customerName || ""}, just checking in - ready for another run of ${target.product || "your order"}?`;
  }
  if (type === "REACTIVATION") {
    return `Hey ${target.customerName || ""}, it's been a bit since your last order - want to get another shirt run going?`;
  }
  if (type === "DEPOSIT_PUSH") {
    return `Hey ${target.customerName || ""}, just following up on your order deposit - let me know if you need anything to move forward.`;
  }
  return `Hey ${target.customerName || ""}, just checking in from Cheeky Tees.`;
}

async function createCampaign(name, type) {
  const prisma = getPrisma();
  if (!prisma) throw new Error("DB_UNAVAILABLE");
  return prisma.campaign.create({
    data: {
      name: String(name || "New Campaign"),
      type: String(type || "REACTIVATION"),
      status: "DRAFT",
    },
  });
}

async function fillCampaignFromPredictions(campaignId) {
  const prisma = getPrisma();
  if (!prisma) throw new Error("DB_UNAVAILABLE");

  const predictions = await prisma.prediction.findMany({
    orderBy: { predictedDate: "asc" },
    take: 25,
  });

  for (const p of predictions) {
    const exists = await prisma.campaignTarget.findFirst({
      where: { campaignId: String(campaignId), customerKey: p.customerKey },
      select: { id: true },
    });
    if (exists) continue;

    await prisma.campaignTarget.create({
      data: {
        campaignId: String(campaignId),
        customerKey: p.customerKey,
        customerName: p.customerName || "",
        messageText: buildMessage("REORDER", p),
        status: "READY",
      },
    });
  }
}

async function fillCampaignFromOldCustomers(campaignId) {
  const prisma = getPrisma();
  if (!prisma) throw new Error("DB_UNAVAILABLE");

  const orders = await prisma.order.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      createdAt: true,
      customerName: true,
      email: true,
      phone: true,
    },
    take: 5000,
  });

  const map = {};
  for (const o of orders) {
    const key = o.email || o.phone || o.customerName || "UNKNOWN";
    if (!map[key]) {
      map[key] = {
        customerKey: key,
        customerName: o.customerName || "Customer",
        lastOrder: o.createdAt,
      };
    }
  }

  const now = Date.now();
  for (const key of Object.keys(map)) {
    const c = map[key];
    const days = (now - new Date(c.lastOrder).getTime()) / (1000 * 60 * 60 * 24);
    if (days < 30) continue;

    const exists = await prisma.campaignTarget.findFirst({
      where: { campaignId: String(campaignId), customerKey: c.customerKey },
      select: { id: true },
    });
    if (exists) continue;

    await prisma.campaignTarget.create({
      data: {
        campaignId: String(campaignId),
        customerKey: c.customerKey,
        customerName: c.customerName,
        messageText: buildMessage("REACTIVATION", c),
        status: "READY",
      },
    });
  }
}

async function fillCampaignFromUnpaidOrders(campaignId) {
  const prisma = getPrisma();
  if (!prisma) throw new Error("DB_UNAVAILABLE");

  const orders = await prisma.order.findMany({
    where: { depositPaid: false },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      customerName: true,
      email: true,
      phone: true,
    },
    take: 1000,
  });

  for (const o of orders) {
    const key = o.email || o.phone || o.customerName || o.id;
    const exists = await prisma.campaignTarget.findFirst({
      where: { campaignId: String(campaignId), customerKey: key },
      select: { id: true },
    });
    if (exists) continue;

    await prisma.campaignTarget.create({
      data: {
        campaignId: String(campaignId),
        customerKey: key,
        customerName: o.customerName || "Customer",
        messageText: buildMessage("DEPOSIT_PUSH", o),
        status: "READY",
      },
    });
  }
}

async function buildCampaign(campaignId) {
  const prisma = getPrisma();
  if (!prisma) throw new Error("DB_UNAVAILABLE");

  const campaign = await prisma.campaign.findUnique({
    where: { id: String(campaignId || "") },
  });
  if (!campaign) throw new Error("CAMPAIGN_NOT_FOUND");

  if (campaign.type === "REORDER") await fillCampaignFromPredictions(campaign.id);
  if (campaign.type === "REACTIVATION") await fillCampaignFromOldCustomers(campaign.id);
  if (campaign.type === "DEPOSIT_PUSH") await fillCampaignFromUnpaidOrders(campaign.id);

  return prisma.campaign.update({
    where: { id: campaign.id },
    data: { status: "READY" },
  });
}

async function getCampaigns() {
  const prisma = getPrisma();
  if (!prisma) throw new Error("DB_UNAVAILABLE");
  return prisma.campaign.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
  });
}

async function getCampaignTargets(campaignId) {
  const prisma = getPrisma();
  if (!prisma) throw new Error("DB_UNAVAILABLE");
  return prisma.campaignTarget.findMany({
    where: { campaignId: String(campaignId || "") },
    orderBy: { createdAt: "desc" },
    take: 500,
  });
}

async function markCampaignTarget(id, status) {
  const prisma = getPrisma();
  if (!prisma) throw new Error("DB_UNAVAILABLE");
  return prisma.campaignTarget.update({
    where: { id: String(id || "") },
    data: { status: String(status || "CONTACTED") },
  });
}

module.exports = {
  createCampaign,
  buildCampaign,
  getCampaigns,
  getCampaignTargets,
  markCampaignTarget,
};
