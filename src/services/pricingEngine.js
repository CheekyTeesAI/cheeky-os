const { calculateJobCost } = require("./costEngine");

function marginFor(qty) {
  if (qty <= 0) return 0.5;
  if (qty < 12) return 0.6;
  if (qty < 24) return 0.5;
  if (qty < 48) return 0.45;
  if (qty < 100) return 0.35;
  if (qty < 250) return 0.3;
  return 0.25;
}

function calculatePrice(job) {
  try {
    const cost = calculateJobCost(job);
    const qty = cost.qty || 1;
    const margin = marginFor(qty);

    const invoiceAmount = Number((job && job.amount) || 0);
    const modeledPrice = cost.totalCost > 0 ? cost.totalCost / (1 - margin) : 0;

    const price = invoiceAmount > 0 ? invoiceAmount : Math.round(modeledPrice * 100) / 100;
    const profit = Math.round((price - cost.totalCost) * 100) / 100;
    const effectiveMargin = price > 0 ? Math.round((profit / price) * 10000) / 100 : 0;

    return {
      jobId: cost.jobId,
      qty,
      method: cost.method,
      cost: cost.totalCost,
      price: Math.round(price * 100) / 100,
      profit,
      marginPercent: effectiveMargin,
      targetMarginPercent: Math.round(margin * 10000) / 100,
      priceSource: invoiceAmount > 0 ? "INVOICE" : "MODELED",
    };
  } catch (error) {
    console.error("[pricingEngine] calculatePrice failed:", error && error.message ? error.message : error);
    return { jobId: job && job.jobId ? job.jobId : "JOB-UNKNOWN", qty: 0, method: "UNKNOWN", cost: 0, price: 0, profit: 0, marginPercent: 0, targetMarginPercent: 0, priceSource: "ERROR" };
  }
}

module.exports = {
  calculatePrice,
  marginFor,
};
