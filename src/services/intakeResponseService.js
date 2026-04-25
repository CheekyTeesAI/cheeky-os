/**
 * Draft replies for missing info — does not send.
 */

function buildMissingInfoResponse(intakeRecord) {
  const missing = Array.isArray(intakeRecord.missingFields) ? intakeRecord.missingFields : [];
  const ex = (intakeRecord && intakeRecord.extractedData) || {};
  const name = ex.customerName || "there";

  const lines = [];
  if (missing.includes("sizes")) lines.push("size breakdown (or size quantities)");
  if (missing.includes("colors")) lines.push("garment color(s)");
  if (missing.includes("due_date")) lines.push("in-hands date or event date");
  if (missing.includes("print_locations")) lines.push("print placement (front/back/chest, etc.)");
  if (missing.includes("quantity")) lines.push("total quantity needed");
  if (missing.includes("garment_or_product")) lines.push("garment style (tees, hoodies, polos, etc.)");
  if (missing.includes("email")) lines.push("best email for the quote");

  const body = [
    `Hi ${name},`,
    "",
    "Thanks for reaching out to Cheeky Tees. To move forward, could you share:",
    ...lines.map((l) => `• ${l}`),
    "",
    intakeRecord.artDetected === false && missing.length
      ? "If you have artwork or a logo file, feel free to attach it as well."
      : "",
    "",
    "Thanks!",
    "Cheeky Tees",
  ]
    .filter(Boolean)
    .join("\n");

  return {
    subject: "Quick details needed for your request — Cheeky Tees",
    body,
    missingFields: missing,
  };
}

module.exports = { buildMissingInfoResponse };
