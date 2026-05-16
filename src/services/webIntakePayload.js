function cleanText(value) {
  return String(value == null ? "" : value).trim();
}

function buildWebIntakeBody(payload) {
  const body = payload && typeof payload === "object" ? payload : {};
  const parts = [];

  const freeText = cleanText(body.body) || cleanText(body.message);
  if (freeText) parts.push(freeText);

  const product = cleanText(body.product);
  if (product) parts.push(`Product: ${product}`);

  const quantity = cleanText(body.quantity);
  if (quantity) parts.push(`Quantity: ${quantity}`);

  const notes = cleanText(body.notes);
  if (notes) parts.push(`Notes: ${notes}`);

  return parts.join("\n");
}

module.exports = {
  buildWebIntakeBody,
};
