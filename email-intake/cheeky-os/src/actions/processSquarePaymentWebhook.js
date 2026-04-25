"use strict";

const squareEventParser = require("../operator/squareEventParser");
const findLeadForPayment = require("../operator/findLeadForPayment");
const applyPaymentToLead = require("../operator/applyPaymentToLead");
const actionAudit = require("../operator/actionAudit");

module.exports = async function processSquarePaymentWebhook(body = {}) {
  try {
    const parsed = squareEventParser(body);

    actionAudit({
      type: "SQUARE_WEBHOOK_RECEIVED",
      squareType: parsed.type,
      email: parsed.email,
      phone: parsed.phone,
      paidAmount: parsed.paidAmount,
    });

    const type = String(parsed.type || "").toLowerCase();
    const looksLikePayment = type.includes("payment") || type.includes("invoice") || type.includes("order");

    if (!looksLikePayment) {
      return {
        success: true,
        ignored: true,
        message: "Webhook not relevant to payment sync",
      };
    }

    const lead = await findLeadForPayment({
      email: parsed.email,
      phone: parsed.phone,
      customerName: parsed.customerName,
    });

    if (!lead) {
      actionAudit({
        type: "SQUARE_WEBHOOK_NO_MATCH",
        squareType: parsed.type,
        email: parsed.email,
        phone: parsed.phone,
      });

      return {
        success: true,
        ignored: true,
        message: "No matching lead found",
      };
    }

    const result = await applyPaymentToLead(lead, {
      paidAmount: parsed.paidAmount,
    });

    actionAudit({
      type: "SQUARE_PAYMENT_APPLIED",
      leadId: lead.id,
      paidAmount: parsed.paidAmount,
      paymentStatus: (result.payment || {}).paymentStatus,
    });

    return result;
  } catch (err) {
    actionAudit({
      type: "SQUARE_WEBHOOK_ERROR",
      error: err && err.message ? err.message : String(err),
    });

    return {
      success: false,
      error: err && err.message ? err.message : String(err),
    };
  }
};
