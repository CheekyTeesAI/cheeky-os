"use strict";

/**
 * GET /api/orders  — Power Apps integration endpoint
 * Returns a flat, normalized order list in the Power Apps shape.
 * Reads from Prisma if available; falls back to mock data.
 *
 * ADDITIVE: does not modify any existing route or service.
 * CommonJS only.
 */

const express = require("express");
const path = require("path");
const router = express.Router();

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getPrisma() {
  try { return require(path.join(__dirname, "..", "lib", "prisma")); } catch (_) { return null; }
}

/**
 * Map internal order status to the Power Apps label set.
 */
function mapOrderStatus(raw) {
  const s = String(raw || "").toUpperCase().trim();
  if (s.includes("COMPLET") || s.includes("DONE") || s.includes("PICKUP")) return "Completed";
  if (s.includes("PRINT")) return "Printing";
  if (s.includes("PRODUCTION") || s.includes("READY")) return "Production Ready";
  if (s.includes("DEPOSIT")) return "Deposit Paid";
  if (s.includes("QUOTE") || s.includes("ESTIMATE")) return "Quote Sent";
  return "Intake";
}

/**
 * Map art file / digitizing state to the Power Apps label set.
 */
function mapArtStatus(order) {
  if (order.digitizingRequired || order.digitizingStatus) return "Digitize";
  // Check art files array if available
  const artFiles = order.artFiles || [];
  if (artFiles.length > 0) {
    const allApproved = artFiles.every((f) => String(f.approvalStatus || "").toUpperCase() === "APPROVED");
    if (allApproved) return "Ready";
    return "Customer";
  }
  if (order.printMethod) {
    const pm = String(order.printMethod).toUpperCase();
    if (pm.includes("EMB") || pm.includes("EMBROID")) return "Digitize";
  }
  return "None";
}

/**
 * Determine printer assignment from routing fields.
 */
function mapPrinter(order) {
  const assignee = String(order.assignedProductionTo || order.productionTypeFinal || "").toUpperCase();
  if (assignee.includes("BULLSEYE") || assignee.includes("VENDOR") || assignee.includes("OUTSOURCE")) return "Bullseye";
  if (assignee.includes("CHEEKY") || assignee.includes("CHARLENE") || assignee.includes("JEREMY") || assignee.includes("IN-HOUSE")) return "Cheeky";
  // Fall back to print method
  const method = String(order.printMethod || "").toUpperCase();
  if (method.includes("SCREEN")) return "Bullseye";
  if (method.includes("DTG") || method.includes("DTF")) return "Cheeky";
  return "Cheeky";
}

/**
 * Shape a Prisma Order row into the Power Apps response format.
 */
function normalizeOrder(o) {
  return {
    id: o.id,
    invoice: o.squareInvoiceId || o.squareInvoiceNumber || o.orderNumber || o.id,
    customerName: o.customerName || "",
    email: o.email || "",
    dueDate: o.completedAt ? new Date(o.completedAt).toISOString() : null,
    printer: mapPrinter(o),
    artStatus: mapArtStatus(o),
    orderStatus: mapOrderStatus(o.status),
  };
}

// ─── Mock fallback ────────────────────────────────────────────────────────────

const MOCK_ORDERS = [
  {
    id: "mock-001",
    invoice: "INV-1001",
    customerName: "Fountain Inn High School",
    email: "principal@fihs.k12.sc.us",
    dueDate: new Date(Date.now() + 7 * 86400000).toISOString(),
    printer: "Cheeky",
    artStatus: "Ready",
    orderStatus: "Production Ready",
  },
  {
    id: "mock-002",
    invoice: "INV-1002",
    customerName: "Carolina CrossFit",
    email: "orders@carolinacrossfit.com",
    dueDate: new Date(Date.now() + 3 * 86400000).toISOString(),
    printer: "Bullseye",
    artStatus: "Digitize",
    orderStatus: "Deposit Paid",
  },
  {
    id: "mock-003",
    invoice: "INV-1003",
    customerName: "Greenville Fire Dept",
    email: "supply@gvlfire.gov",
    dueDate: new Date(Date.now() + 14 * 86400000).toISOString(),
    printer: "Cheeky",
    artStatus: "Customer",
    orderStatus: "Quote Sent",
  },
  {
    id: "mock-004",
    invoice: "INV-1004",
    customerName: "Simpsonville Parks & Rec",
    email: "parks@simpsonville.sc.gov",
    dueDate: new Date(Date.now() - 2 * 86400000).toISOString(),
    printer: "Cheeky",
    artStatus: "Ready",
    orderStatus: "Printing",
  },
  {
    id: "mock-005",
    invoice: "INV-1005",
    customerName: "Cheeky Tees Staff",
    email: "internal@cheekytees.com",
    dueDate: new Date(Date.now() + 21 * 86400000).toISOString(),
    printer: "Other",
    artStatus: "None",
    orderStatus: "Intake",
  },
];

// ─── Route ────────────────────────────────────────────────────────────────────

router.get("/", async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 100, 500);
  const stage =
    typeof req.query.stage === "string" && req.query.stage.trim()
      ? req.query.stage.trim().toUpperCase()
      : "";

  try {
    const prisma = getPrisma();

    if (!prisma) {
      return res.json(MOCK_ORDERS);
    }

    const where = { deletedAt: null };
    if (stage && stage !== "ALL") {
      where.status = stage;
    }

    const orders = await prisma.order.findMany({
      where,
      select: {
        id: true,
        orderNumber: true,
        customerName: true,
        email: true,
        status: true,
        completedAt: true,
        squareInvoiceId: true,
        squareInvoiceNumber: true,
        printMethod: true,
        assignedProductionTo: true,
        productionTypeFinal: true,
        digitizingRequired: true,
        digitizingStatus: true,
        artFiles: { select: { approvalStatus: true }, take: 10 },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    return res.json(orders.map(normalizeOrder));
  } catch (err) {
    console.warn("[orders/powerapps] DB error — returning mock data:", err && err.message ? err.message : err);
    return res.json(MOCK_ORDERS);
  }
});

module.exports = router;
