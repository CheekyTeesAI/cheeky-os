function checkInventory(purchaseList) {
  try {
    const list = Array.isArray(purchaseList) ? purchaseList : [];
    const needed = list.map((line) => ({
      product: line.product,
      garment: line.garment,
      color: line.color,
      sizes: line.sizes,
      total: line.total,
      jobs: line.jobs,
      onHand: 0,
      shortBy: line.total,
      status: "ORDER",
    }));
    return {
      needed,
      available: [],
      assumed: "zero on-hand (inventory integration not configured)",
    };
  } catch (error) {
    console.error("[inventoryEngine] checkInventory failed:", error && error.message ? error.message : error);
    return { needed: [], available: [], assumed: "inventory_error" };
  }
}

module.exports = {
  checkInventory,
};
