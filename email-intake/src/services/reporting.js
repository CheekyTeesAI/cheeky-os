const reports = require("./squareReportingService.js");
const memory = require("./memory.js");

function isVip(totalSpend, totalOrders) {
  return Number(totalSpend) >= 1000 || Number(totalOrders) >= 8;
}

async function dailySummary() {
  const [daily, orders, outstanding] = await Promise.all([
    reports.getDailySales(),
    reports.getOrders({
      start: new Date(new Date().setHours(0, 0, 0, 0)),
      end: new Date(),
    }),
    reports.getOutstandingInvoices(),
  ]);

  const overdueOrders = Array.isArray(outstanding.unpaidInvoices)
    ? outstanding.unpaidInvoices.length
    : 0;
  const tasksInQueue = overdueOrders + (Array.isArray(orders) ? orders.length : 0);
  const out = {
    ordersCreatedToday: Number(daily.totalOrders || 0),
    ordersCompletedToday: Number(daily.totalOrders || 0),
    revenueToday: Number(daily.totalRevenue || 0),
    tasksInQueue,
    overdueOrders,
  };
  try {
    memory.logDecision("report_requested", { period: "today" }, out, "success", "Daily summary generated");
  } catch (_) {}
  return out;
}

async function weeklySummary() {
  const [trend, orders, topCustomers] = await Promise.all([
    reports.getWeeklySales(),
    reports.getOrders({
      start: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      end: new Date(),
    }),
    reports.getTopCustomers(),
  ]);
  const revenueThisWeek = (Array.isArray(trend) ? trend : []).reduce(
    (sum, d) => sum + (Number(d.revenue) || 0),
    0
  );
  const printMethodBreakdown = {};
  for (const o of orders || []) {
    const key = String(o.printMethod || "UNKNOWN").toUpperCase();
    printMethodBreakdown[key] = (printMethodBreakdown[key] || 0) + 1;
  }
  const out = {
    ordersThisWeek: Array.isArray(orders) ? orders.length : 0,
    revenueThisWeek: Math.round(revenueThisWeek * 100) / 100,
    topCustomers: Array.isArray(topCustomers) ? topCustomers : [],
    printMethodBreakdown,
  };
  try {
    memory.logDecision("report_requested", { period: "week" }, out, "success", "Weekly summary generated");
  } catch (_) {}
  return out;
}

async function customerReport(email) {
  const target = String(email || "").trim().toLowerCase();
  const [customers, orders] = await Promise.all([
    reports.getCustomers(),
    reports.getOrders({
      start: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000),
      end: new Date(),
    }),
  ]);
  const customer = (customers || []).find(
    (c) => String(c.email || "").toLowerCase() === target
  );
  if (!customer) {
    return {
      totalOrders: 0,
      totalSpend: 0,
      lastOrderDate: null,
      averageOrderValue: 0,
      vipStatus: false,
    };
  }
  const rows = (orders || []).filter(
    (o) => String(o.customerId || "") === String(customer.id || "")
  );
  const totalOrders = rows.length;
  const totalSpend = rows.reduce((s, r) => s + (Number(r.total) || 0), 0);
  const lastOrderDate = rows.length
    ? rows
        .map((r) => String(r.createdAt || ""))
        .sort()
        .slice(-1)[0]
    : null;
  const averageOrderValue = totalOrders ? totalSpend / totalOrders : 0;
  const out = {
    totalOrders,
    totalSpend: Math.round(totalSpend * 100) / 100,
    lastOrderDate,
    averageOrderValue: Math.round(averageOrderValue * 100) / 100,
    vipStatus: isVip(totalSpend, totalOrders),
  };
  try {
    memory.logDecision("report_requested", { period: "customer", email }, out, "success", "Customer report generated");
  } catch (_) {}
  return out;
}

module.exports = {
  dailySummary,
  weeklySummary,
  customerReport,
};
