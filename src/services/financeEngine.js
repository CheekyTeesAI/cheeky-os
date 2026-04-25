const { calculatePrice } = require("./pricingEngine");

function round2(n) { return Math.round(Number(n || 0) * 100) / 100; }

function summarizeJobs(jobs) {
  try {
    const list = Array.isArray(jobs) ? jobs : [];
    let totalRevenue = 0;
    let totalCost = 0;
    let totalProfit = 0;
    let openRevenue = 0;
    let paidRevenue = 0;
    let overdueRevenue = 0;
    const perJob = [];

    for (const job of list) {
      const p = calculatePrice(job);
      totalRevenue += p.price;
      totalCost += p.cost;
      totalProfit += p.profit;
      const status = String((job && job.status) || "").toUpperCase();
      if (status === "PAID") paidRevenue += p.price;
      else if (status === "OVERDUE") overdueRevenue += p.price;
      else openRevenue += p.price;
      perJob.push({
        jobId: p.jobId,
        customer: job && job.customer ? job.customer : "Unknown Customer",
        status,
        price: p.price,
        cost: p.cost,
        profit: p.profit,
        marginPercent: p.marginPercent,
        priceSource: p.priceSource,
      });
    }

    const margin = totalRevenue > 0 ? round2((totalProfit / totalRevenue) * 100) : 0;

    return {
      totalJobs: list.length,
      totalRevenue: round2(totalRevenue),
      totalCost: round2(totalCost),
      totalProfit: round2(totalProfit),
      marginPercent: margin,
      paidRevenue: round2(paidRevenue),
      openRevenue: round2(openRevenue),
      overdueRevenue: round2(overdueRevenue),
      perJob,
    };
  } catch (error) {
    console.error("[financeEngine] summarizeJobs failed:", error && error.message ? error.message : error);
    return { totalJobs: 0, totalRevenue: 0, totalCost: 0, totalProfit: 0, marginPercent: 0, paidRevenue: 0, openRevenue: 0, overdueRevenue: 0, perJob: [] };
  }
}

module.exports = {
  summarizeJobs,
};
