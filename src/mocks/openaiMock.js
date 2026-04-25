function extractIntentFromEmail(payload) {
  const subject = String(payload && payload.subject ? payload.subject : "").toLowerCase();
  const body = String(payload && payload.body ? payload.body : "").toLowerCase();
  const from = String(payload && payload.from ? payload.from : "").trim();
  const source = `${subject} ${body}`;

  let intent = "GENERAL_INQUIRY";
  if (source.includes("invoice") || source.includes("pay")) intent = "PAYMENT";
  else if (source.includes("rush")) intent = "RUSH_ORDER";
  else if (source.includes("quote") || source.includes("how much")) intent = "QUOTE_REQUEST";
  else if (source.includes("order")) intent = "ORDER_REQUEST";

  return {
    intent,
    customer_name: from.includes("@") ? from.split("@")[0] : from || "Unknown Customer",
    product_interest: source.includes("hat") ? "HATS" : source.includes("shirt") ? "SHIRTS" : "APPAREL",
    urgency: source.includes("asap") || source.includes("rush") ? 5 : 2,
    suggested_action: intent === "PAYMENT" ? "EMAIL_COLLECTIONS" : intent === "RUSH_ORDER" ? "CALL_NOW" : "EMAIL_RESPONSE",
  };
}

module.exports = {
  extractIntentFromEmail,
};
