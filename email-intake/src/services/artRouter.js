/**
 * Art routing helper (Peter) — email-ready payload.
 */

function routeToPeter(order) {
  const o = order && typeof order === "object" ? order : {};
  const orderId = String(o.orderId || o.id || "").trim();
  return {
    orderId,
    recipient: "peter",
    requirements: {
      format: "PNG",
      transparentBackground: true,
      width: 5000,
      height: 5000,
    },
    emailPayload: {
      to: "peter@cheekytees.local",
      subject: `Art routing for order ${orderId || "unknown"}`,
      body: "Please prepare transparent PNG artwork at 5000x5000.",
      meta: {
        customerName: o.customerName || "",
        garmentType: o.garmentType || "",
      },
    },
  };
}

module.exports = { routeToPeter };
