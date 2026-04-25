"use strict";

const buildWorkOrderPacket = (job, order) => {
  const lineItems = (order.lineItems || []).map((item) => ({
    product: item.product || item.description || "",
    color: item.color || "",
    material: item.material || "",
    quantity: item.quantity || 0,
    printType: item.printType || item.productionType || "",
    sizesJson: item.sizesJson || null,
  }));

  const totalQty = lineItems.reduce((sum, item) => sum + (item.quantity || 0), 0);

  return {
    productionJobId: job.id,
    orderId: order.id,
    customerName: order.customerName || "",
    assignedTo: job.assignedTo || "",
    vendorName: job.vendorName || "",
    vendorEmail: job.vendorEmail || "",
    type: job.type || "",
    status: job.status || "",
    dueDate: order.dueDate || null,
    notes: order.notes || "",
    totalQty,
    lineItems,
    createdAt: new Date().toISOString(),
  };
};

module.exports = { buildWorkOrderPacket };
