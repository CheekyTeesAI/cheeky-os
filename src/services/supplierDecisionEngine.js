/**
 * Choose wholesale supplier for a shortage line (defaults + assumptions).
 */

function chooseSupplier(item, opts) {
  const map = (opts && opts.skuVendorMap) || {};
  const sku = String((item && item.sku) || "").trim();
  if (sku && map[sku]) {
    return { supplier: map[sku], reason: "SKU override map", assumption: false };
  }

  const rush = Boolean(opts && opts.rush);
  const route = String((item && item.route) || "").toUpperCase();
  if (item && item.shipDirectToVendor && route === "BULLSEYE") {
    return {
      supplier: "Carolina Made",
      reason: "Bullseye route — default vendor; confirm ship-to address on PO",
      assumption: true,
    };
  }

  if (rush) {
    return {
      supplier: "Carolina Made",
      reason: "Rush — preferred local default (verify stock)",
      assumption: true,
    };
  }

  const brand = String((item && item.brand) || "").toLowerCase();
  if (brand.includes("gildan") || brand.includes("bella")) {
    return { supplier: "Carolina Made", reason: "Preferred default supplier", assumption: true };
  }

  return { supplier: "S&S", reason: "Fallback catalog supplier", assumption: true };
}

module.exports = {
  chooseSupplier,
};
