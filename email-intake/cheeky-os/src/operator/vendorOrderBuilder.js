"use strict";

module.exports = function vendorOrderBuilder(input = {}) {
  try {
    const vendorName = input.vendorName || "UNKNOWN_VENDOR";
    const customerName = input.customerName || "Unknown Customer";
    const quantity = Number(input.quantity || 0);
    const garment = input.garment || "Unspecified Garment";
    const color = input.color || "Unspecified Color";
    const sizes = input.sizes || {};
    const notes = input.notes || "";

    const lineItems = [];

    const sizeKeys = Object.keys(sizes || {});
    if (sizeKeys.length > 0) {
      sizeKeys.forEach((size) => {
        const qty = Number(sizes[size] || 0);
        if (qty > 0) {
          lineItems.push({
            garment,
            color,
            size,
            quantity: qty,
            sku: null,
          });
        }
      });
    }

    if (lineItems.length === 0 && quantity > 0) {
      lineItems.push({
        garment,
        color,
        size: "MIXED/UNSPECIFIED",
        quantity,
        sku: null,
      });
    }

    const totalQty = lineItems.reduce((sum, item) => sum + Number(item.quantity || 0), 0);

    return {
      vendorName,
      customerName,
      totalQty,
      lineItems,
      notes,
      status: "DRAFT",
    };
  } catch (_) {
    return {
      vendorName: "UNKNOWN_VENDOR",
      customerName: "Unknown Customer",
      totalQty: 0,
      lineItems: [],
      notes: "Builder fallback",
      status: "DRAFT",
    };
  }
};
