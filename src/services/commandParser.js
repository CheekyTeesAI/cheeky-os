"use strict";

function parseCommand(input) {
  if (!input) return { action: "UNKNOWN" };

  const raw = String(input || "").trim();
  if (!raw) return { action: "UNKNOWN" };
  const text = raw.toLowerCase();

  if (text.startsWith("new order") || text.startsWith("create order") || text.startsWith("create an order")) {
    return {
      action: "CREATE_ORDER",
      payload: {
        customerName:
          raw
            .replace(/new order|create an order|create order/i, "")
            .trim()
            .replace(/^for\s+/i, "")
            .trim() || "Walk-in",
        quantity: 1,
        product: "T-Shirts",
      },
    };
  }

  if (text.includes("production") || text.includes("queue") || text.includes("printing")) {
    return { action: "GET_PRODUCTION_QUEUE" };
  }

  if (text.includes("follow")) {
    return { action: "RUN_FOLLOWUPS" };
  }

  if (text.includes("run schedule") || text.includes("schedule")) {
    return { action: "RUN_SCHEDULE" };
  }

  if (
    text.includes("insight") ||
    text.includes("attention") ||
    text.includes("what should i do") ||
    text.includes("what needs")
  ) {
    return { action: "GET_INSIGHTS" };
  }

  if (text.includes("deal") || text.includes("close")) {
    return { action: "GET_DEALS" };
  }

  if (text.includes("next")) {
    return { action: "GET_NEXT_JOB" };
  }

  return { action: "UNKNOWN" };
}

module.exports = { parseCommand };
