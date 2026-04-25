"use strict";

module.exports = function generateMessage(action) {
  try {
    if (!action) return null;

    // FOLLOW-UP INVOICE
    if (action.type === "FOLLOW_UP_INVOICE") {
      return `Hey ${action.customerName || "there"}, just checking in on your quote. Let me know if you'd like to move forward or need any changes — happy to help!`;
    }

    // REACTIVATE CUSTOMER
    if (action.type === "REACTIVATE_CUSTOMER") {
      return `Hey ${action.customerName || "there"}, it’s been a little while — wanted to check in and see if you need any shirts or merch coming up. We’d love to help out!`;
    }

    return "Hey! Just reaching out to check in. Let me know how I can help.";
  } catch (_) {
    return "Error generating message";
  }
};
