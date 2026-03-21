/**
 * Square API field mapper for Cheeky Tees.
 * Converts internal order fields to Square API v2 format
 * for invoices, estimates, and customer records.
 *
 * @module integrations/square-mapper
 */

/**
 * Map a Cheeky order's printType to a Square line item display name.
 * @param {string} printType - Internal print type (e.g. "screen print", "DTG").
 * @returns {string} Human-readable line item name for Square.
 */
function mapLineItemName(printType) {
  const pt = (printType || "").toLowerCase().trim();
  if (pt.includes("screen")) return "Screen Print";
  if (pt.includes("dtg") || pt.includes("direct to garment")) return "DTG (Direct to Garment)";
  if (pt.includes("dtf") || pt.includes("direct to film")) return "DTF (Direct to Film)";
  if (pt.includes("sublimation") || pt.includes("dye sub")) return "Full Sublimation";
  if (pt.includes("embroidery") || pt.includes("embroider")) return "Embroidery";
  if (pt.includes("vinyl") || pt.includes("htv")) return "Vinyl / HTV";
  return printType || "Custom Print";
}

/**
 * Build a Square line item description from order fields.
 * @param {Object} orderData - Order data with product, quantity, printType, sizes.
 * @returns {string} Description string for the Square line item.
 */
function buildLineItemDescription(orderData) {
  const parts = [];
  if (orderData.product) parts.push(`Product: ${orderData.product}`);
  if (orderData.quantity) parts.push(`Qty: ${orderData.quantity}`);
  if (orderData.sizes) parts.push(`Sizes: ${orderData.sizes}`);
  if (orderData.notes) parts.push(`Notes: ${orderData.notes}`);
  parts.push("Cheeky Tees Order — Auto Generated");
  return parts.join(" | ");
}

/**
 * Calculate a payment due date from an order deadline string.
 * Falls back to 30 days from now if no deadline is provided.
 * @param {string} deadline - Deadline string (ISO, human-readable, or empty).
 * @returns {string} Due date in YYYY-MM-DD format.
 */
function calculateDueDate(deadline) {
  if (deadline) {
    // Try to parse the deadline
    const d = new Date(deadline);
    if (!isNaN(d.getTime()) && d.getTime() > Date.now()) {
      return d.toISOString().slice(0, 10);
    }
  }
  // Default: 30 days from now
  const future = new Date();
  future.setDate(future.getDate() + 30);
  return future.toISOString().slice(0, 10);
}

/**
 * Map Cheeky order data to a Square invoice line item structure.
 * @param {Object} orderData - Order data from the intake pipeline.
 * @returns {Object} Square-compatible line item object.
 */
function mapToSquareLineItem(orderData) {
  const qty = parseInt(orderData.quantity, 10) || 1;
  return {
    name: mapLineItemName(orderData.printType),
    description: buildLineItemDescription(orderData),
    quantity: String(qty),
    // Amount is intentionally left at 0 for DRAFT invoices —
    // Pat will fill in pricing before sending to the customer.
    base_price_money: {
      amount: 0,
      currency: "USD",
    },
  };
}

/**
 * Map Cheeky order data to a Square customer creation payload.
 * @param {string} name  - Customer full name.
 * @param {string} email - Customer email address.
 * @param {string} phone - Customer phone number.
 * @returns {Object} Square-compatible customer object.
 */
function mapToSquareCustomer(name, email, phone) {
  const customer = {};
  if (name) {
    const parts = name.trim().split(/\s+/);
    customer.given_name = parts[0] || "";
    customer.family_name = parts.slice(1).join(" ") || "";
  }
  if (email) customer.email_address = email;
  if (phone) customer.phone_number = phone;
  customer.note = "Cheeky Tees — Auto Created";
  customer.reference_id = `cheeky-${Date.now()}`;
  return customer;
}

/**
 * Build a memo/note for a Square invoice from order data.
 * @param {Object} orderData - Order data from the intake pipeline.
 * @returns {string} Invoice memo string.
 */
function buildInvoiceMemo(orderData) {
  const parts = ["Cheeky Tees Order — Auto Generated"];
  if (orderData.product) parts.push(`Product: ${orderData.product}`);
  if (orderData.printType) parts.push(`Print: ${mapLineItemName(orderData.printType)}`);
  if (orderData.quantity) parts.push(`Qty: ${orderData.quantity}`);
  if (orderData.sizes) parts.push(`Sizes: ${orderData.sizes}`);
  if (orderData.notes) parts.push(`Notes: ${orderData.notes}`);
  return parts.join("\n");
}

module.exports = {
  mapLineItemName,
  buildLineItemDescription,
  calculateDueDate,
  mapToSquareLineItem,
  mapToSquareCustomer,
  buildInvoiceMemo,
};
