/**
 * Work order packet — loads dist/workOrderService.js
 */

const express = require("express");
const path = require("path");

const router = express.Router();
router.use(express.json());

const memoryService = require(path.join(
  __dirname,
  "..",
  "..",
  "src",
  "services",
  "memoryService.js"
));

function loadWorkOrders() {
  try {
    return require(path.join(
      __dirname,
      "..",
      "..",
      "dist",
      "services",
      "workOrderService.js"
    ));
  } catch {
    return null;
  }
}

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

router.get("/ready", async (_req, res) => {
  const mod = loadWorkOrders();
  if (!mod || typeof mod.listWorkOrdersReady !== "function") {
    return res.status(503).json({
      success: false,
      error: "Work order module unavailable — run `npm run build` in email-intake",
      count: 0,
      items: [],
    });
  }
  try {
    const items = await mod.listWorkOrdersReady(100);
    return res.json({ success: true, count: items.length, items });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return res
      .status(500)
      .json({ success: false, error: msg, count: 0, items: [] });
  }
});

router.post("/generate", async (req, res) => {
  const mod = loadWorkOrders();
  if (!mod || typeof mod.generateWorkOrder !== "function") {
    return res.status(503).json({
      success: false,
      error: "Work order module unavailable — run `npm run build`",
    });
  }
  const orderId = String((req.body && req.body.orderId) || "").trim();
  if (!orderId) {
    return res.status(400).json({ success: false, error: "orderId required" });
  }
  try {
    const out = await mod.generateWorkOrder(orderId);
    if (!out.ok) {
      try {
        memoryService.logEvent("work_order_blocked", { orderId, blockers: out.blockers });
      } catch (_) {}
      return res.status(400).json({
        success: false,
        message: "Work order not ready",
        blockers: out.blockers,
      });
    }
    try {
      memoryService.logEvent("work_order_generated", {
        orderId,
        workOrderNumber: out.workOrderNumber,
      });
    } catch (_) {}
    return res.json({
      success: true,
      action: "work_order_generated",
      orderId,
      workOrderNumber: out.workOrderNumber,
      workOrder: out.packet,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("not found")) {
      return res.status(404).json({ success: false, error: msg });
    }
    return res.status(500).json({ success: false, error: msg });
  }
});

router.post("/:orderId/mark-printed", async (req, res) => {
  const mod = loadWorkOrders();
  if (!mod || typeof mod.markWorkOrderPrinted !== "function") {
    return res.status(503).json({
      success: false,
      error: "Work order module unavailable — run `npm run build`",
    });
  }
  const orderId = String(req.params.orderId || "").trim();
  if (!orderId) {
    return res.status(400).json({ success: false, error: "orderId required" });
  }
  try {
    await mod.markWorkOrderPrinted(orderId);
    try {
      memoryService.logEvent("work_order_printed", { orderId });
    } catch (_) {}
    return res.json({ success: true, action: "work_order_printed", orderId });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ success: false, error: msg });
  }
});

router.get("/:orderId/print", async (req, res) => {
  const mod = loadWorkOrders();
  if (
    !mod ||
    typeof mod.loadOrderForWorkOrder !== "function" ||
    typeof mod.buildWorkOrderPacket !== "function"
  ) {
    return res
      .status(503)
      .type("html")
      .send("<p>Work order module unavailable.</p>");
  }
  const orderId = String(req.params.orderId || "").trim();
  if (!orderId) {
    return res.status(400).type("html").send("<p>Missing order id.</p>");
  }
  try {
    const order = await mod.loadOrderForWorkOrder(orderId);
    if (!order) {
      return res.status(404).type("html").send("<p>Order not found.</p>");
    }
    const packet = mod.buildWorkOrderPacket(order);
    const logoPath = "/assets/logo.png";
    const lines = (packet.lineItems || [])
      .map(
        (li) =>
          `<tr><td>${esc(li.name)}</td><td>${esc(li.quantity)}</td><td>${esc(li.notes || "—")}</td><td>${esc(li.printLocations || "—")}</td></tr>`
      )
      .join("");
    const tasks = (packet.taskSummary || [])
      .map(
        (t) =>
          `<li>${esc(t.title)} <span class="muted">(${esc(t.status)})</span></li>`
      )
      .join("");
    const blockHtml =
      packet.blockers && packet.blockers.length
        ? `<section class="warn"><strong>Blockers</strong><ul>${packet.blockers.map((b) => `<li>${esc(b)}</li>`).join("")}</ul></section>`
        : "";
    const links = [
      packet.mockupUrl && `<li><a href="${esc(packet.mockupUrl)}">Mockup</a></li>`,
      packet.artFileUrl && `<li><a href="${esc(packet.artFileUrl)}">Art file</a></li>`,
      packet.proofFileUrl && `<li><a href="${esc(packet.proofFileUrl)}">Proof file</a></li>`,
    ]
      .filter(Boolean)
      .join("");

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Work Order ${esc(packet.workOrderNumber || orderId)}</title>
<style>
  body { font-family: system-ui, sans-serif; margin: 1.5rem; color: #111; }
  header { display: flex; align-items: center; gap: 1rem; margin-bottom: 1rem; }
  h1 { font-size: 1.35rem; margin: 0; }
  table { width: 100%; border-collapse: collapse; margin: 1rem 0; font-size: 0.95rem; }
  th, td { border: 1px solid #ccc; padding: 0.4rem 0.5rem; text-align: left; }
  th { background: #f4f4f4; }
  .muted { color: #555; font-size: 0.9rem; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem 1.5rem; }
  .warn { background: #fff8e6; border: 1px solid #e6c200; padding: 0.75rem; margin: 1rem 0; }
  @media print { body { margin: 0.5rem; } }
</style>
</head>
<body>
<header>
  <img src="${logoPath}" height="48" alt="" onerror="this.style.display='none'"/>
  <div>
    <h1>Work order — ${esc(packet.workOrderNumber || "—")}</h1>
    <p class="muted">${esc(packet.customerName || "Customer")} · ${esc(packet.customerEmail || "")}</p>
  </div>
</header>
<section class="grid">
  <div><strong>Order ID</strong><br/><span class="muted">${esc(packet.orderId)}</span></div>
  <div><strong>Stage</strong><br/>${esc(packet.stage)}</div>
  <div><strong>Due</strong><br/>${esc(packet.dueDate || "—")}</div>
  <div><strong>WO status</strong><br/>${esc(packet.workOrderStatus)}</div>
  <div><strong>Deposit</strong><br/>${esc(packet.depositStatus)}</div>
  <div><strong>Proof</strong><br/>${esc(packet.proofStatus || "—")}</div>
  <div><strong>Art</strong><br/>${esc(packet.artStatus || "—")}</div>
  <div><strong>Garments</strong><br/>${esc(packet.garmentOrderStatus || "—")}</div>
</section>
${blockHtml}
<h2>Line items</h2>
<table>
  <thead><tr><th>Item</th><th>Qty</th><th>Notes</th><th>Print</th></tr></thead>
  <tbody>${lines || '<tr><td colspan="4" class="muted">No line items</td></tr>'}</tbody>
</table>
<h2>Production notes</h2>
<p>${esc(packet.productionNotes || "—")}</p>
<h2>Files</h2>
<ul>${links || '<li class="muted">No links on file</li>'}</ul>
<h2>Tasks</h2>
<ul>${tasks || '<li class="muted">None</li>'}</ul>
<p class="muted">Printed ${esc(new Date().toISOString())}</p>
</body>
</html>`;
    return res.type("html").send(html);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(500).type("html").send("<p>" + esc(msg) + "</p>");
  }
});

router.get("/:orderId", async (req, res) => {
  const mod = loadWorkOrders();
  if (
    !mod ||
    typeof mod.loadOrderForWorkOrder !== "function" ||
    typeof mod.buildWorkOrderPacket !== "function" ||
    typeof mod.isWorkOrderReady !== "function"
  ) {
    return res.status(503).json({
      success: false,
      error: "Work order module unavailable — run `npm run build`",
    });
  }
  const orderId = String(req.params.orderId || "").trim();
  if (!orderId) {
    return res.status(400).json({ success: false, error: "orderId required" });
  }
  try {
    const order = await mod.loadOrderForWorkOrder(orderId);
    if (!order) {
      return res.status(404).json({ success: false, error: "Order not found" });
    }
    const packet = mod.buildWorkOrderPacket(order);
    const gate = mod.isWorkOrderReady(order);
    const generated =
      String(order.workOrderStatus || "").toUpperCase() === "GENERATED" ||
      String(order.workOrderStatus || "").toUpperCase() === "PRINTED";
    return res.json({
      success: true,
      generated,
      ready: gate.ready,
      blockers: gate.blockers,
      workOrder: packet,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ success: false, error: msg });
  }
});

module.exports = router;
