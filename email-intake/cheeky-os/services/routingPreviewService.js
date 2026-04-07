/**
 * Bundle 52 — recent capture orders → routing preview for /app (read-only + estimates).
 */

const { getPrisma } = require("../marketing/prisma-client");
const {
  computeRoutingDecision,
  isRushDeadline,
} = require("./routingService");

/**
 * @param {object} o
 * @returns {object}
 */
function mapCaptureOrderToRoutingInput(o) {
  if (!o || typeof o !== "object") {
    return {
      quantity: 0,
      garmentType: "",
      material: "cotton",
      printColors: 1,
      deadline: "",
      estimatedRevenue: 0,
      estimatedCostInHouse: 0,
      estimatedCostVendor: 0,
    };
  }
  const qty = Math.max(0, Math.floor(Number(o.quantity) || 0));
  const product = String(o.product != null ? o.product : "").toLowerCase();
  const print = String(o.printType != null ? o.printType : "").toLowerCase();
  let material = "cotton";
  if (/poly|polyester|dry\s*fit/.test(product)) material = "polyester";
  else if (/triblend|tri-blend/.test(product)) material = "triblend";
  let printColors = 1;
  if (/screen|two|2[\s-]?col|multi|process/.test(print)) printColors = 2;
  const balance = Math.max(0, Number(o.balanceDue) || 0);
  const rev = balance > 0 ? Math.max(100, balance * 1.15) : Math.max(50, qty * 16);
  const costIn = Math.max(1, qty * 9.25);
  const costV = Math.max(1, qty * 8);
  return {
    quantity: qty,
    garmentType: String(o.product != null ? o.product : "").trim(),
    material,
    printColors,
    deadline: String(o.dueDate != null ? o.dueDate : "").trim(),
    estimatedRevenue: rev,
    estimatedCostInHouse: costIn,
    estimatedCostVendor: costV,
  };
}

/**
 * @param {number} [limit]
 * @returns {Promise<object[]>}
 */
async function getRecentRoutingPreviews(limit) {
  const cap = Math.min(10, Math.max(1, Math.floor(Number(limit) || 5)));
  const prisma = getPrisma();
  if (!prisma || !prisma.captureOrder) return [];

  let rows = [];
  try {
    rows = await prisma.captureOrder.findMany({
      orderBy: { createdAt: "desc" },
      take: cap,
    });
  } catch (_) {
    return [];
  }

  return rows.map((o) => {
    const input = mapCaptureOrderToRoutingInput(o);
    const route = computeRoutingDecision(input);
    const rush = isRushDeadline(input.deadline);
    const savings =
      route.marginInHouse > route.marginVendor
        ? 0
        : Math.max(0, (route.marginVendor - route.marginInHouse) * 100);
    return {
      orderId: o.id,
      customerName: String(o.customerName || "").trim(),
      quantity: input.quantity,
      ...route,
      vendorSavingsPctPoints: Math.round(savings * 10) / 10,
      rush,
      vendorBetterButRushed:
        rush &&
        route.marginVendor > route.marginInHouse &&
        route.recommendedRoute === "in_house",
    };
  });
}

module.exports = {
  getRecentRoutingPreviews,
  mapCaptureOrderToRoutingInput,
};
