"use strict";

const crypto = require("crypto");
const { getPrisma, runDecisionEngineInTransaction } = require("./decisionEngine");
const { computeRoutingHint } = require("./routingService");

function buildQuickEmail(phone) {
  const h = crypto.createHash("sha256").update(String(phone || "")).digest("hex").slice(0, 28);
  return `est-${h}@cheeky-intake.local`;
}

function buildEstimateHtml({ name, phone, qty, description }) {
  const safe = (s) =>
    String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>Cheeky Tees — Estimate</title>
  <style>
    body { font-family: system-ui, Segoe UI, Arial, sans-serif; margin: 0; background: #0f1419; color: #e8eef5; }
    .wrap { max-width: 720px; margin: 0 auto; padding: 32px 20px 48px; }
    .card { background: #1a222c; border: 1px solid #2a3542; border-radius: 12px; padding: 24px; }
    h1 { font-size: 1.5rem; margin: 0 0 8px; color: #fff; }
    .sub { color: #9ab0c7; font-size: 0.95rem; margin-bottom: 24px; }
    table { width: 100%; border-collapse: collapse; }
    th, td { text-align: left; padding: 10px 0; border-bottom: 1px solid #2a3542; }
    th { color: #7d93ab; font-weight: 600; font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.04em; }
    .total { margin-top: 20px; font-size: 1.1rem; font-weight: 700; color: #7ee787; }
    .foot { margin-top: 28px; font-size: 0.85rem; color: #6b7c91; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="card">
      <h1>Project estimate</h1>
      <p class="sub">Cheeky Tees LLC · Fountain Inn, SC</p>
      <table>
        <tr><th>Customer</th><td>${safe(name)}</td></tr>
        <tr><th>Phone</th><td>${safe(phone)}</td></tr>
        <tr><th>Quantity</th><td>${safe(String(qty))}</td></tr>
        <tr><th>Description</th><td>${safe(description)}</td></tr>
      </table>
      <p class="total">Quote pending — reply to approve and we’ll send deposit details.</p>
      <p class="foot">This is a draft estimate. Pricing may be adjusted after art review.</p>
    </div>
  </div>
</body>
</html>`;
}

async function createEstimateDraft(body) {
  const name = String(body.name || "").trim();
  const phone = String(body.phone || "").trim();
  const qty = Math.max(1, parseInt(String(body.qty || "1"), 10) || 1);
  const description = String(body.description || "").trim();
  const email = String(body.email || "").trim() || buildQuickEmail(phone);
  if (!name || !phone || !description) {
    return { success: false, error: "name, phone, and description are required", code: "VALIDATION_ERROR" };
  }
  const prisma = getPrisma();
  if (!prisma) {
    return { success: false, error: "Database unavailable", code: "DB_UNAVAILABLE" };
  }
  const htmlBody = buildEstimateHtml({ name, phone, qty, description });
  try {
    const est = await prisma.estimate.create({
      data: {
        name,
        phone,
        email,
        qty,
        description,
        htmlBody,
        status: "DRAFT",
      },
    });
    return { success: true, data: { estimate: est } };
  } catch (e) {
    console.error("[estimateEngine.createEstimateDraft]", e && e.stack ? e.stack : e);
    return { success: false, error: e && e.message ? e.message : "create_failed", code: "ESTIMATE_CREATE_FAILED" };
  }
}

async function approveEstimate(estimateId) {
  const id = String(estimateId || "").trim();
  if (!id) {
    return { success: false, error: "estimate id required", code: "VALIDATION_ERROR" };
  }
  const prisma = getPrisma();
  if (!prisma) {
    return { success: false, error: "Database unavailable", code: "DB_UNAVAILABLE" };
  }
  try {
    const est = await prisma.estimate.update({
      where: { id },
      data: { status: "APPROVED" },
    });
    return { success: true, data: { estimate: est } };
  } catch (e) {
    console.error("[estimateEngine.approveEstimate]", e && e.stack ? e.stack : e);
    return { success: false, error: e && e.message ? e.message : "approve_failed", code: "ESTIMATE_APPROVE_FAILED" };
  }
}

async function convertEstimateToOrder(estimateId) {
  const id = String(estimateId || "").trim();
  if (!id) {
    return { success: false, error: "estimate id required", code: "VALIDATION_ERROR" };
  }
  const prisma = getPrisma();
  if (!prisma) {
    return { success: false, error: "Database unavailable", code: "DB_UNAVAILABLE" };
  }
  try {
    const out = await prisma.$transaction(async (tx) => {
      const est = await tx.estimate.findUnique({ where: { id } });
      if (!est) {
        throw new Error("ESTIMATE_NOT_FOUND");
      }
      if (est.status !== "APPROVED") {
        throw new Error("ESTIMATE_NOT_APPROVED");
      }
      if (est.orderId) {
        throw new Error("ESTIMATE_ALREADY_CONVERTED");
      }
      const route = computeRoutingHint({ description: est.description, qty: est.qty });
      const email = est.email && est.email.includes("@") ? est.email : buildQuickEmail(est.phone || "");
      let customer = await tx.customer.findUnique({ where: { email } });
      if (!customer) {
        customer = await tx.customer.create({
          data: {
            name: est.name,
            email,
            phone: est.phone || null,
          },
        });
      }
      const order = await tx.order.create({
        data: {
          customerId: customer.id,
          customerName: est.name,
          phone: est.phone || "",
          email,
          quantity: est.qty,
          notes: est.description,
          printMethod: route.productionType,
          lineItems: {
            create: [
              {
                description: est.description,
                quantity: est.qty,
                unitPrice: 0,
                productionType: route.productionType,
              },
            ],
          },
        },
        include: { lineItems: true },
      });
      await tx.productionRoute.upsert({
        where: { orderId: order.id },
        create: {
          orderId: order.id,
          routeStatus: "ROUTED",
          productionType: route.productionType,
          assignee: "Jeremy",
          rationale: route.rationale,
        },
        update: {
          routeStatus: "ROUTED",
          productionType: route.productionType,
          assignee: "Jeremy",
          rationale: route.rationale,
        },
      });
      await tx.estimate.update({
        where: { id: est.id },
        data: { orderId: order.id, status: "CONVERTED" },
      });
      const finalOrder = await runDecisionEngineInTransaction(tx, order.id);
      return { estimate: await tx.estimate.findUnique({ where: { id: est.id } }), order: finalOrder };
    });
    return { success: true, data: out };
  } catch (e) {
    console.error("[estimateEngine.convertEstimateToOrder]", e && e.stack ? e.stack : e);
    const msg = e && e.message ? e.message : "convert_failed";
    let code = "ESTIMATE_CONVERT_FAILED";
    if (msg === "ESTIMATE_NOT_FOUND") code = "NOT_FOUND";
    if (msg === "ESTIMATE_NOT_APPROVED") code = "NOT_APPROVED";
    if (msg === "ESTIMATE_ALREADY_CONVERTED") code = "ALREADY_CONVERTED";
    return { success: false, error: msg, code };
  }
}

module.exports = {
  buildEstimateHtml,
  createEstimateDraft,
  approveEstimate,
  convertEstimateToOrder,
};
