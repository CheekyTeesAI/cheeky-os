"use strict";

module.exports = async function invoiceAction(command) {
  return {
    success: true,
    action: "invoice_or_quote",
    message: "Invoice/quote command received",
    command: String(command || ""),
  };
};
