"use strict";

function buildGarmentPacket(order) {
  const items = (Array.isArray(order && order.lineItems) ? order.lineItems : []).map((i) => ({
    product: (i && i.product) || "",
    color: (i && i.color) || "",
    material: (i && i.material) || "",
    quantity: Number(i && i.quantity ? i.quantity : 0),
  }));

  const totalQty = items.reduce((sum, i) => sum + Number(i.quantity || 0), 0);

  return {
    orderId: String((order && order.id) || ""),
    customerName: String((order && order.customerName) || ""),
    totalQty,
    items,
    notes: String((order && order.notes) || ""),
  };
}

module.exports = { buildGarmentPacket };
