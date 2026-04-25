"use strict";

module.exports = function squareEventParser(body = {}) {
  try {
    const type = body.type || body.event_type || "";
    const data = body.data || {};
    const object = data.object || {};

    const parsed = {
      type,
      paidAmount: 0,
      customerName: null,
      email: null,
      phone: null,
      raw: body,
    };

    if (object.payment) {
      parsed.paidAmount = Number((((object.payment || {}).amount_money || {}).amount || 0)) / 100;
      parsed.customerName = object.payment.buyer_email_address || null;
      parsed.email = object.payment.buyer_email_address || null;
    }

    if (object.invoice) {
      parsed.customerName = (((object.invoice || {}).primary_recipient || {}).customer_id) || parsed.customerName;
      parsed.email = (((object.invoice || {}).primary_recipient || {}).email_address) || parsed.email;
      parsed.paidAmount =
        Number((((((object.invoice || {}).payment_requests || [])[0] || {}).computed_amount_money || {}).amount || 0)) / 100;
    }

    if (object.order) {
      const recipient = (((object.order || {}).fulfillments || [])[0] || {}).recipient || {};
      parsed.customerName = recipient.display_name || parsed.customerName;
      parsed.email = recipient.email_address || parsed.email;
      parsed.phone = recipient.phone_number || parsed.phone;
    }

    return parsed;
  } catch (_) {
    return {
      type: "UNKNOWN",
      paidAmount: 0,
      customerName: null,
      email: null,
      phone: null,
      raw: body,
    };
  }
};
