"use strict";

// Normalizes Dataverse cr2d1_intakequeue rows safely.
// Returns a consistent object regardless of schema completeness.
// TODO SCHEMA: cr2d1_status missing in Dataverse — add column when safe
// TODO SCHEMA: cr2d1_customer_name missing in Dataverse — add column when safe
// TODO SCHEMA: cr2d1_order_name missing in Dataverse — verify column name

function mapIntakeRow(row) {
  if (!row || typeof row !== "object") {
    return {
      status: "unknown",
      customerName: "Unknown Customer",
      orderName: "Untitled Intake",
      createdAt: null,
      source: "dataverse_intake_queue",
      schemaWarnings: ["Row was null or non-object — full data unavailable"],
    };
  }

  const schemaWarnings = [];
  if (!row.cr2d1_status && !row.status) schemaWarnings.push("Missing field: cr2d1_status");
  if (!row.cr2d1_customer_name && !row.customerName && !row.name)
    schemaWarnings.push("Missing field: cr2d1_customer_name");
  if (!row.cr2d1_order_name && !row.orderName) schemaWarnings.push("Missing field: cr2d1_order_name");
  if (schemaWarnings.length) {
    console.warn("[SCHEMA WARNING] Dataverse intake row incomplete:", schemaWarnings.join(" | "));
  }

  return {
    status: row.cr2d1_status || row.status || "unknown",
    customerName: row.cr2d1_customer_name || row.customerName || row.name || "Unknown Customer",
    orderName: row.cr2d1_order_name || row.orderName || "Untitled Intake",
    createdAt: row.createdon || row.createdAt || null,
    source: "dataverse_intake_queue",
    schemaWarnings,
  };
}

function mapIntakeRows(rows) {
  if (!Array.isArray(rows)) return [];
  return rows.map(mapIntakeRow);
}

module.exports = { mapIntakeRow, mapIntakeRows };
