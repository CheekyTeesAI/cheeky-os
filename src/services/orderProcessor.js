async function processOrder(order) {
  console.log("💰 Processing order:", order.id);

  const tasks = [];

  for (const item of order.lineItems || []) {
    let type = "DTG";

    const name = (item.name || "").toLowerCase();

    if (name.includes("screen")) type = "SCREEN_PRINT";
    if (name.includes("dtf")) type = "DTF";
    if (name.includes("embroidery")) type = "EMBROIDERY";

    tasks.push({
      orderId: order.id,
      type,
      status: "READY",
      title: `${type} - ${item.name}`
    });
  }

  console.log("🛠 Tasks created:", tasks.length);

  return tasks;
}

module.exports = { processOrder };
