function inferTaskType(name = "") {
  const n = String(name).toLowerCase();
  if (n.includes("screen")) return "SCREEN_PRINT";
  if (n.includes("dtf")) return "DTF";
  if (n.includes("embroidery")) return "EMBROIDERY";
  return "DTG";
}

async function processSquarePaymentEvent(event) {
  const payment = event?.data?.object?.payment || {};

  const order = {
    squarePaymentId: payment?.id || null,
    squareOrderId: payment?.order_id || null,
    buyerEmail: payment?.buyer_email_address || null,
    amountMoney: payment?.amount_money?.amount ?? 0,
    currency: payment?.amount_money?.currency || "USD",
    sourceEventType: event?.type || "unknown",
    lineItems: []
  };

  const tasks = [
    {
      title: "REVIEW ORDER",
      type: "REVIEW",
      status: "READY"
    }
  ];

  return { order, tasks };
}

module.exports = { processSquarePaymentEvent };
