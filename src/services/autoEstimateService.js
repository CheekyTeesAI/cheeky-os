"use strict";

const { getPrisma } = require("./decisionEngine");

function money(n) {
  return Math.round((Number(n || 0) + Number.EPSILON) * 100) / 100;
}

function buildEstimateHtml(data) {
  const esc = (s) =>
    String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"/><title>Estimate</title></head>
<body style="font-family:Segoe UI,Arial,sans-serif;background:#0f1720;color:#e6edf3;padding:24px;">
  <h2>Cheeky Tees Estimate</h2>
  <p><strong>Customer:</strong> ${esc(data.customerName)}</p>
  <p><strong>Order:</strong> ${esc(data.orderRef)}</p>
  <table style="width:100%;border-collapse:collapse;">
    <tr><th align="left">Line</th><th align="right">Qty</th><th align="right">Unit</th><th align="right">Line Total</th></tr>
    ${data.lines
      .map(
        (l) =>
          `<tr><td>${esc(l.description)}</td><td align="right">${l.quantity}</td><td align="right">$${l.unitPrice.toFixed(
            2
          )}</td><td align="right">$${l.lineTotal.toFixed(2)}</td></tr>`
      )
      .join("")}
  </table>
  <p><strong>Subtotal:</strong> $${data.subtotal.toFixed(2)}</p>
  <p><strong>Tax (6%):</strong> $${data.tax.toFixed(2)}</p>
  <p><strong>Total:</strong> $${data.total.toFixed(2)}</p>
  <p><strong>Deposit (50%):</strong> $${data.deposit.toFixed(2)}</p>
  <p style="opacity:.8;">Draft only — not sent automatically.</p>
</body>
</html>`;
}

function unitPriceFor(printMethod, colors) {
  const base = 3;
  const pm = String(printMethod || "").toUpperCase();
  if (pm.includes("SCREEN")) return base + 3 * Math.max(1, Number(colors || 1));
  if (pm.includes("DTF")) return base + 5;
  return base + 6;
}

async function buildEstimate(order) {
  const basePrice = 12;
  const qty = Math.max(1, Number(order && order.quantity ? order.quantity : 1));
  const total = qty * basePrice;
  return {
    amount: total,
    lineItems: [
      {
        name: (order && (order.product || order.notes)) || "Custom Apparel",
        quantity: qty,
        basePriceMoney: {
          amount: Math.round(total * 100),
          currency: "USD",
        },
      },
    ],
  };
}

async function autoGenerateEstimateFromOrder(orderId) {
  const id = String(orderId || "").trim();
  if (!id) {
    return { success: false, error: "orderId required", code: "VALIDATION_ERROR" };
  }
  const prisma = getPrisma();
  if (!prisma) {
    return { success: false, error: "Database unavailable", code: "DB_UNAVAILABLE" };
  }
  try {
    const out = await prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { id },
        include: { lineItems: true },
      });
      if (!order) throw new Error("ORDER_NOT_FOUND");

      const linesIn = Array.isArray(order.lineItems) && order.lineItems.length
        ? order.lineItems
        : [{ description: order.notes || "Apparel order", quantity: order.quantity || 1, unitPrice: 0 }];

      const lines = linesIn.map((li) => {
        const qty = Math.max(1, Number(li.quantity || 1));
        const unit = money(unitPriceFor(order.printMethod || li.productionType, 1));
        return {
          description: li.description || "Line item",
          quantity: qty,
          unitPrice: unit,
          lineTotal: money(unit * qty),
        };
      });
      const subtotal = money(lines.reduce((acc, l) => acc + l.lineTotal, 0));
      const tax = money(subtotal * 0.06);
      const total = money(subtotal + tax);
      const deposit = money(total * 0.5);
      const htmlBody = buildEstimateHtml({
        customerName: order.customerName,
        orderRef: order.orderNumber || order.id,
        lines,
        subtotal,
        tax,
        total,
        deposit,
      });
      const estimate = await tx.estimate.create({
        data: {
          name: order.customerName,
          phone: order.phone,
          email: order.email,
          qty: lines.reduce((acc, l) => acc + l.quantity, 0),
          description: order.notes || "Auto estimate",
          htmlBody,
          status: "DRAFT",
          orderId: order.id,
        },
      });
      return { estimate, pricing: { subtotal, tax, total, deposit } };
    });
    return { success: true, data: out };
  } catch (err) {
    console.error("[autoEstimateService.autoGenerateEstimateFromOrder]", err && err.stack ? err.stack : err);
    const msg = err && err.message ? err.message : "auto_estimate_failed";
    const code = msg === "ORDER_NOT_FOUND" ? "NOT_FOUND" : "AUTO_ESTIMATE_FAILED";
    return { success: false, error: msg, code };
  }
}

module.exports = {
  buildEstimate,
  autoGenerateEstimateFromOrder,
};
