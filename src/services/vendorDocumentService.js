/**
 * PO attachment bundles (text/JSON on disk; PDF-ready structure).
 */
const fs = require("fs");
const path = require("path");
const os = require("os");

function outDir() {
  const d = path.join(os.tmpdir(), "vendor-outbound");
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
  return d;
}

function buildStandardPOAttachment(po, shipTo) {
  const p = po || {};
  const lines = [
    `PURCHASE ORDER ${p.poNumber || ""}`,
    `Supplier: ${p.supplier || ""}`,
    `Total units: ${p.totalUnits || 0}`,
    ``,
    `SHIP TO:`,
    `${shipTo.shipToName || ""}`,
    `${shipTo.address1 || ""}`,
    `${shipTo.city || ""}, ${shipTo.state || ""} ${shipTo.zip || ""}`,
    ``,
    `LINE ITEMS:`,
    ...(Array.isArray(p.items) ? p.items : []).map(
      (it) => `- ${it.sku || it.product} ${it.color || ""} ${it.size || ""} × ${it.qty || 0}`,
    ),
    ``,
    `LINKED JOBS: ${(p.linkedJobs || []).join(", ") || "—"}`,
    p.notes ? `NOTES: ${p.notes}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const fn = `${String(p.poNumber || "PO").replace(/[^A-Za-z0-9-]/g, "_")}-standard.txt`;
  const fp = path.join(outDir(), fn);
  fs.writeFileSync(fp, lines, "utf8");
  return { path: fp, filename: fn, type: "text/plain" };
}

function buildBullseyeDirectShipAttachment(po, shipTo) {
  const p = po || {};
  const lines = [
    `BULLSEYE DIRECT-SHIP — ${p.poNumber || ""}`,
    `Destination (production):`,
    `${shipTo.shipToName || ""}`,
    `${shipTo.address1 || ""}`,
    `${shipTo.city || ""}, ${shipTo.state || ""} ${shipTo.zip || ""}`,
    ``,
    `Garment order summary (link to Bullseye production / work orders separately):`,
    ...(Array.isArray(p.items) ? p.items : []).map(
      (it) => `- ${it.sku || it.product} ${it.color || ""} ${it.size || ""} × ${it.qty || 0}`,
    ),
    ``,
    `Jobs: ${(p.linkedJobs || []).join(", ") || "—"}`,
    `Do not treat as Bullseye screen work order — purchasing layer only.`,
  ].join("\n");

  const fn = `${String(p.poNumber || "PO").replace(/[^A-Za-z0-9-]/g, "_")}-bullseye-direct.txt`;
  const fp = path.join(outDir(), fn);
  fs.writeFileSync(fp, lines, "utf8");
  return { path: fp, filename: fn, type: "text/plain" };
}

function prepareAttachmentBundle(po, vendor, shipTo) {
  const v = vendor || {};
  const fmt = String(v.poFormat || "STANDARD").toUpperCase();
  const primary =
    fmt === "BULLSEYE" ? buildBullseyeDirectShipAttachment(po, shipTo) : buildStandardPOAttachment(po, shipTo);
  const safePo = String((po && po.poNumber) || "PO").replace(/[^A-Za-z0-9-]/g, "_");
  const jsonPath = path.join(outDir(), `${safePo}.json`);
  fs.writeFileSync(
    jsonPath,
    JSON.stringify(
      {
        poNumber: po.poNumber,
        supplier: po.supplier,
        items: po.items,
        shipTo,
        linkedJobs: po.linkedJobs,
        vendorKey: v.vendorKey,
      },
      null,
      2,
    ),
    "utf8",
  );
  return {
    attachments: [
      primary,
      { path: jsonPath, filename: path.basename(jsonPath), type: "application/json" },
    ],
  };
}

module.exports = {
  buildStandardPOAttachment,
  buildBullseyeDirectShipAttachment,
  prepareAttachmentBundle,
};
