"use strict";

module.exports = async function orderStatusAction(command) {
  return {
    success: true,
    action: "order_status",
    message: "Order/status command received",
    command: String(command || ""),
  };
};
