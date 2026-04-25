"use strict";

const { getPrisma } = require("./decisionEngine");

async function getReactivationTargets() {
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
    take: 2000,
  });

  const map = {};
  for (const o of orders) {
    const key = o.email || o.phone || o.customerName;
    if (!key) continue;

    if (!map[key]) {
      map[key] = {
        customer: key,
        customerName: o.customerName,
        lastOrder: o.createdAt,
        count: 0,
      };
    }

    map[key].count += 1;
    if (new Date(o.createdAt).getTime() > new Date(map[key].lastOrder).getTime()) {
      map[key].lastOrder = o.createdAt;
    }
  }

  const now = Date.now();
  return Object.values(map)
    .filter((c) => {
      const days = (now - new Date(c.lastOrder).getTime()) / (1000 * 60 * 60 * 24);
      return days > 30;
    })
    .sort((a, b) => new Date(a.lastOrder).getTime() - new Date(b.lastOrder).getTime());
}

function buildReactivationMessage(customer) {
  return {
    text: `Hey ${customer.customerName || ""}, just checking in - ready for more shirts? We can run your last order again fast.`,
    html: `<p>Hey ${customer.customerName || ""},</p><p>Ready for another run? We can reprint your last order quickly.</p>`,
  };
}

module.exports = {
  getReactivationTargets,
  buildReactivationMessage,
};
