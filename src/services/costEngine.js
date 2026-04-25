const DEFAULTS = {
  BLANK_SHIRT: 3.0,
  BLANK_HOODIE: 12.0,
  BLANK_POLO: 6.5,
  BLANK_HAT: 4.5,
  BLANK_TANK: 3.5,
  BLANK_LONG_SLEEVE: 5.0,
  DTG_PER_UNIT: 4.0,
  SCREEN_PER_COLOR_PER_UNIT: 2.5,
  SCREEN_SETUP: 25.0,
  DTF_PER_UNIT: 3.0,
  EMBROIDERY_PER_UNIT: 5.0,
  HEAT_PRESS_PER_UNIT: 2.75,
  UNKNOWN_PER_UNIT: 4.0,
};

function blankCostFor(garment) {
  const g = String(garment || "").toUpperCase();
  if (g.includes("HOODIE") || g.includes("SWEAT")) return DEFAULTS.BLANK_HOODIE;
  if (g.includes("POLO")) return DEFAULTS.BLANK_POLO;
  if (g.includes("HAT") || g.includes("CAP") || g.includes("BEANIE")) return DEFAULTS.BLANK_HAT;
  if (g.includes("TANK")) return DEFAULTS.BLANK_TANK;
  if (g.includes("LONG")) return DEFAULTS.BLANK_LONG_SLEEVE;
  return DEFAULTS.BLANK_SHIRT;
}

function totalQty(job) {
  const items = Array.isArray(job && job.lineItems) ? job.lineItems : [];
  const qty = items.reduce((sum, it) => sum + Number((it && it.qty) || 0), 0);
  if (qty > 0) return qty;
  return 1;
}

function detectColorCount(job) {
  const notes = String((job && job.notes) || "").toLowerCase();
  const m = notes.match(/(\d+)\s*color/);
  if (m) return Math.max(1, Math.min(6, parseInt(m[1], 10) || 1));
  if (notes.includes("full color") || notes.includes("full-color")) return 4;
  if (notes.includes("2 color") || notes.includes("two color")) return 2;
  return 1;
}

function methodOf(job) {
  const raw = String((job && (job.printMethod || job.productionType)) || "").toUpperCase();
  if (raw === "HEAT PRESS") return "HEAT_PRESS";
  return raw || "UNKNOWN";
}

function calculateJobCost(job) {
  try {
    const items = Array.isArray(job && job.lineItems) ? job.lineItems : [];
    const qty = totalQty(job);
    const method = methodOf(job);

    let blankCost = 0;
    if (items.length > 0) {
      for (const it of items) {
        const q = Number((it && it.qty) || 0) || 0;
        blankCost += q * blankCostFor(it && it.garment);
      }
    } else {
      blankCost = qty * blankCostFor(job && job.garment);
    }

    let printCost = 0;
    const colors = detectColorCount(job);
    switch (method) {
      case "DTG":
        printCost = qty * DEFAULTS.DTG_PER_UNIT;
        break;
      case "SCREEN":
        printCost = DEFAULTS.SCREEN_SETUP * colors + qty * DEFAULTS.SCREEN_PER_COLOR_PER_UNIT * colors;
        break;
      case "DTF":
        printCost = qty * DEFAULTS.DTF_PER_UNIT;
        break;
      case "EMBROIDERY":
        printCost = qty * DEFAULTS.EMBROIDERY_PER_UNIT;
        break;
      case "HEAT_PRESS":
        printCost = qty * DEFAULTS.HEAT_PRESS_PER_UNIT;
        break;
      default:
        printCost = qty * DEFAULTS.UNKNOWN_PER_UNIT;
        break;
    }

    const totalCost = Math.round((blankCost + printCost) * 100) / 100;
    return {
      jobId: job && job.jobId ? job.jobId : "JOB-UNKNOWN",
      qty,
      method,
      colors,
      blankCost: Math.round(blankCost * 100) / 100,
      printCost: Math.round(printCost * 100) / 100,
      totalCost,
    };
  } catch (error) {
    console.error("[costEngine] calculateJobCost failed:", error && error.message ? error.message : error);
    return { jobId: job && job.jobId ? job.jobId : "JOB-UNKNOWN", qty: 0, method: "UNKNOWN", colors: 1, blankCost: 0, printCost: 0, totalCost: 0 };
  }
}

module.exports = {
  calculateJobCost,
  COST_DEFAULTS: DEFAULTS,
};
