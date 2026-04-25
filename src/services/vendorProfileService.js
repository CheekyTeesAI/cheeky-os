/**
 * Default vendor profiles; env overrides for email.
 */

function getVendorProfiles() {
  const assumptions = ["Vendor emails from env when set; placeholders block outbound until configured."];
  return {
    vendors: [
      {
        vendorKey: "carolina_made",
        name: "Carolina Made",
        email: String(process.env.CAROLINA_MADE_EMAIL || "").trim(),
        supportsDirectShip: true,
        defaultShipTo: "SHOP",
        poFormat: "STANDARD",
        notes: "Preferred default supplier",
      },
      {
        vendorKey: "ss",
        name: "S&S",
        email: String(process.env.SS_EMAIL || "").trim(),
        supportsDirectShip: false,
        defaultShipTo: "SHOP",
        poFormat: "STANDARD",
        notes: "Fallback catalog",
      },
      {
        vendorKey: "sanmar",
        name: "SanMar",
        email: String(process.env.SANMAR_EMAIL || "").trim(),
        supportsDirectShip: false,
        defaultShipTo: "SHOP",
        poFormat: "STANDARD",
        notes: "Wholesale fallback",
      },
      {
        vendorKey: "bullseye",
        name: "Bullseye",
        email: String(process.env.BULLSEYE_EMAIL || "").trim(),
        supportsDirectShip: true,
        defaultShipTo: "BULLSEYE",
        poFormat: "BULLSEYE",
        notes: "Screen / direct-ship production partner",
      },
      {
        vendorKey: "alpha_broder",
        name: "AlphaBroder",
        email: String(process.env.ALPHA_BRODER_EMAIL || "").trim(),
        supportsDirectShip: false,
        defaultShipTo: "SHOP",
        poFormat: "SIMPLE",
        notes: "Optional fallback",
      },
    ],
    assumptions,
  };
}

function getVendorBySupplierName(supplierName) {
  const { vendors } = getVendorProfiles();
  const s = String(supplierName || "").toLowerCase();
  if (s.includes("carolina")) return vendors.find((v) => v.vendorKey === "carolina_made") || vendors[0];
  if (s === "s&s" || s.includes("s and s")) return vendors.find((v) => v.vendorKey === "ss") || vendors[1];
  if (s.includes("sanmar")) return vendors.find((v) => v.vendorKey === "sanmar") || vendors[2];
  if (s.includes("bullseye")) return vendors.find((v) => v.vendorKey === "bullseye") || vendors[3];
  if (s.includes("alpha")) return vendors.find((v) => v.vendorKey === "alpha_broder") || vendors[4];
  return vendors.find((v) => v.name === supplierName) || vendors[0];
}

module.exports = {
  getVendorProfiles,
  getVendorBySupplierName,
};
