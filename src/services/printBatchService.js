"use strict";

function createBatches(orders) {
  const batches = {};
  const rows = Array.isArray(orders) ? orders : [];

  rows.forEach((order) => {
    const items = Array.isArray(order && order.lineItems) ? order.lineItems : [];

    items.forEach((item) => {
      const printType =
        (item && (item.printType || item.productionType)) ||
        (order && order.printMethod) ||
        "unknown";
      const color = (item && item.color) || "unknown";
      const product = (item && (item.product || item.description)) || "unknown";
      const qty = Number(item && item.quantity ? item.quantity : 0) || 0;

      const key = [printType, color, product].join("|");

      if (!batches[key]) {
        batches[key] = {
          batchKey: key,
          printType,
          color,
          product,
          totalQty: 0,
          orders: [],
        };
      }

      batches[key].totalQty += qty;
      batches[key].orders.push({
        orderId: order && order.id ? order.id : "",
        qty,
      });
    });
  });

  return Object.values(batches).sort((a, b) => b.totalQty - a.totalQty);
}

module.exports = { createBatches };
