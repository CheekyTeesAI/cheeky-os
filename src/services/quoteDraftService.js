/**
 * Structured quote draft from intake — no Square write unless explicitly extended elsewhere.
 */

function buildQuoteDraftFromIntake(intakeRecord) {
  const ex = (intakeRecord && intakeRecord.extractedData) || {};
  const customer = {
    id: intakeRecord.customerId || null,
    name: ex.customerName || null,
    email: ex.email || null,
    phone: ex.phone || null,
    company: ex.company || null,
  };

  const items = [];
  if (ex.quantity && ex.garment) {
    items.push({
      description: `${ex.garment}${ex.colors && ex.colors.length ? ` — ${ex.colors.join(", ")}` : ""}`,
      quantity: Number(ex.quantity) || null,
      sizes: ex.sizes || [],
      printLocations: ex.printLocations || [],
      printMethod: ex.printMethod || null,
    });
  }

  const assumptions = Array.isArray(intakeRecord.assumptions) ? [...intakeRecord.assumptions] : [];
  const missingFields = Array.isArray(intakeRecord.missingFields) ? [...intakeRecord.missingFields] : [];

  const criticalMissing = missingFields.filter((m) =>
    ["quantity", "email", "garment_or_product"].includes(m),
  );
  const readyForSquare =
    Boolean(customer.email) && items.length > 0 && criticalMissing.length === 0;

  return {
    customer,
    items,
    assumptions,
    missingFields,
    readyForSquare,
    note:
      "Data completeness flag only — Square API write is not invoked from this draft unless a separate approved flow is enabled.",
  };
}

module.exports = { buildQuoteDraftFromIntake };
