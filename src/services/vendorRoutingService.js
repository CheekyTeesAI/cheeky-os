"use strict";

function determineVendorRoute(order) {
  const items = Array.isArray(order && order.lineItems) ? order.lineItems : [];

  const qty = items.reduce((sum, i) => sum + Number(i && i.quantity ? i.quantity : 0), 0);

  const hasPoly = items.some((i) =>
    String((i && i.material) || "")
      .toLowerCase()
      .includes("poly")
  );

  const hasEmbroidery = items.some((i) =>
    String((i && i.printType) || "")
      .toLowerCase()
      .includes("embroider")
  );

  const hasFullColor = items.some((i) =>
    ["dtg", "dtf", "full"].some((k) =>
      String((i && i.printType) || "")
        .toLowerCase()
        .includes(k)
    )
  );

  if (hasEmbroidery) {
    return {
      productionType: "EMBROIDERY",
      vendorRoute: "VENDOR",
      vendorName: "Embroidery Vendor",
      reason: "Embroidery",
    };
  }

  if (qty >= 24 && !hasFullColor) {
    return {
      productionType: "SCREENPRINT",
      vendorRoute: "BULLSEYE",
      vendorName: "Bullseye Inks",
      reason: "Bulk",
    };
  }

  if (hasPoly) {
    return {
      productionType: "DTF",
      vendorRoute: "IN_HOUSE",
      vendorName: "Cheeky",
      reason: "Poly",
    };
  }

  if (hasFullColor && qty < 24) {
    return {
      productionType: "DTG",
      vendorRoute: "IN_HOUSE",
      vendorName: "Cheeky",
      reason: "Small full color",
    };
  }

  return {
    productionType: "DTG",
    vendorRoute: "IN_HOUSE",
    vendorName: "Cheeky",
    reason: "Default",
  };
}

module.exports = { determineVendorRoute };
/**
 * Auto vendor / production routing — decides Bullseye vs in-house vs DTF before execution.
 * Rules are applied in precedence order (locked policy).
 */

const { createFoundationJob } = require("./foundationJobService");
const { logEvent } = require("./foundationEventLog");
const { routeJob } = require("./routingEngine");
const { hasArtFlag } = require("./priorityEngine");

let saveJob;
function getSaveJob() {
  if (!saveJob) {
    try {
      saveJob = require("../data/store").saveJob;
    } catch (_e) {
      saveJob = null;
    }
  }
  return saveJob;
}

function normalize(s) {
  return String(s || "").toLowerCase();
}

function detectForceBullseye(text, body) {
  const b = body && typeof body === "object" ? body : {};
  if (b.forceBullseye === true || (b.workOrder && b.workOrder.forceBullseye === true)) return true;
  const t = normalize(text);
  return /\bforce\s+bullseye\b|\bbullseye\s+only\b|\bmust\s+go\s+to\s+bullseye\b|\boverride.*bullseye\b/i.test(t);
}

/**
 * Infer max spot colors from parsed job + raw text.
 */
function inferPrintColors(parsed, text) {
  const parts = parsed.locationColorParts || [];
  let maxC = 0;
  for (const p of parts) {
    if (p && typeof p.count === "number" && p.count > maxC) maxC = p.count;
  }
  const re = /(\d+)\s+colors?\b/gi;
  let m;
  while ((m = re.exec(text)) !== null) {
    const n = Number(m[1]);
    if (n > maxC) maxC = n;
  }
  if (maxC > 0) return Math.min(99, maxC);
  const wo = parsed.printColors;
  if (typeof wo === "number" && wo > 0) return wo;
  return 1;
}

function inferMaterial(parsed, text, body) {
  const b = body && typeof body === "object" ? body : {};
  const wo = b.workOrder && typeof b.workOrder === "object" ? b.workOrder : {};
  const m = String(wo.material || b.material || parsed.material || "").toLowerCase().trim();
  if (m) return m;
  const t = normalize(text);
  if (/\bpolyester\b|\bpoly-blend\b|\b100%\s*poly\b/i.test(t)) return "polyester";
  if (/\bcotton\b/.test(t)) return "cotton";
  return "";
}

/**
 * Days until due — null if unknown (skips rush rule).
 */
function inferDeadlineDays(parsed, text) {
  const t = String(text || "");
  if (/\bdue\s+next\s+week\b/i.test(t)) return 7;
  if (/\bdue\s+(this\s+)?tomorrow\b/i.test(t)) return 1;
  if (/\bdue\s+today\b/i.test(t)) return 0;
  if (/\bdue\s+next\s+day\b/i.test(t)) return 1;
  const m = t.match(/\bin\s+(\d{1,2})\s+days?\b/i);
  if (m) return Number(m[1]);
  if (parsed && parsed.dueDate) {
    const d = new Date(parsed.dueDate);
    if (!Number.isNaN(d.getTime())) {
      const now = new Date();
      const diff = (d.getTime() - now.getTime()) / 86400000;
      return Math.max(0, Math.ceil(diff));
    }
  }
  return null;
}

function inferHasArtReady(parsed, text, body) {
  const b = body && typeof body === "object" ? body : {};
  if (b.artReady === true || (b.workOrder && b.workOrder.artReady === true)) return true;
  if (parsed && parsed.attachArt) return true;
  const t = normalize(text);
  if (/\bart\s+ready\b|\bart\s+on\s+file\b|\bfiles?\s+ready\b/i.test(t)) return true;
  return false;
}

/**
 * Build normalized job object for routing.
 */
function buildJobInput(parsed, text, body) {
  const quantity = Math.max(0, Number(parsed.quantity) || 0);
  const printColors = inferPrintColors(parsed, text);
  const garmentType = String(parsed.product || "tees").trim();
  const material = inferMaterial(parsed, text, body);
  const deadlineDays = inferDeadlineDays(parsed, text);
  const printLocations = Array.isArray(parsed.printLocations) ? parsed.printLocations : [];
  const hasArtReady = inferHasArtReady(parsed, text, body);

  return {
    quantity,
    printColors,
    garmentType,
    material,
    deadlineDays,
    printLocations,
    hasArtReady,
  };
}

/**
 * Locked precedence: override → polyester → >4 colors → rush → low qty → Bullseye band → default in-house.
 */
function decideRoute(job, opts) {
  const forceBullseye = opts && opts.forceBullseye;
  if (forceBullseye) {
    return { route: "BULLSEYE", reason: "Manual override — force Bullseye", confidence: 1 };
  }

  const j = job || {};
  const qty = Number(j.quantity) || 0;
  const colors = Number(j.printColors);
  const pc = Number.isFinite(colors) ? colors : 1;
  const mat = normalize(j.material);
  const ddl = j.deadlineDays;

  if (mat === "polyester") {
    return { route: "DTF", reason: "Polyester substrate → DTF", confidence: 0.92 };
  }
  if (pc > 4) {
    return { route: "DTF", reason: "More than 4 print colors → DTF", confidence: 0.9 };
  }
  if (ddl != null && ddl <= 3) {
    return { route: "IN_HOUSE", reason: "Rush deadline (≤3 days) → in-house", confidence: 0.88 };
  }
  if (qty > 0 && qty < 24) {
    return { route: "IN_HOUSE", reason: "Quantity under 24 → in-house (DTG/DTF as configured)", confidence: 0.85 };
  }
  if (qty >= 24 && pc <= 4) {
    return { route: "BULLSEYE", reason: "Volume screen run (≥24 pcs, ≤4 colors) → Bullseye", confidence: 0.87 };
  }

  return { route: "IN_HOUSE", reason: "Default — in-house production", confidence: 0.72 };
}

function lineItemsFromParsed(parsed) {
  const qty = Math.max(1, Number(parsed.quantity) || 1);
  const product = String(parsed.product || "tees").trim();
  return [
    {
      product,
      garment: product,
      quantity: qty,
      color: parsed.color || null,
      size: null,
    },
  ];
}

async function persistFoundationAndStore(parsed, body, printMethod, routingNote) {
  const items = lineItemsFromParsed(parsed);
  const dueDate = parsed.dueDate ? new Date(parsed.dueDate).toISOString() : new Date(Date.now() + 7 * 86400000).toISOString();
  const payload = {
    customerName: parsed.customerName || "Unknown Customer",
    items,
    lineItems: items,
    notes: [parsed.notesLine || parsed.notes || "", routingNote].filter(Boolean).join("\n"),
    dueDate,
    printMethod,
    productionType: printMethod,
    hasArt: Boolean(parsed.attachArt) || Boolean(body && body.hasArt),
  };

  let created;
  try {
    created = await createFoundationJob(payload);
  } catch (e) {
    const msg = e && e.message ? e.message : "foundation_error";
    console.warn("[vendorRoutingService] createFoundationJob failed:", msg);
    created = { success: false, reason: msg };
  }
  const sj = getSaveJob();
  if (created.success && created.job && sj) {
    sj({
      jobId: created.job.jobId,
      customer: created.job.customer,
      lineItems: created.job.lineItems,
      notes: payload.notes,
      dueDate: created.job.dueDate,
      productionType: printMethod,
      printMethod,
      status: created.job.status,
      source: "vendor-routing+foundation",
      vendorRoute: routingNote,
    });
  }

  if (created.success && created.job) {
    try {
      await logEvent(created.job.jobId, "VENDOR_ROUTE", routingNote);
    } catch (_e) {
      /* optional */
    }
    return { ok: true, job: created.job, mock: false };
  }

  if (sj) {
    const job = sj({
      customer: parsed.customerName,
      lineItems: items,
      notes: payload.notes,
      dueDate,
      productionType: printMethod,
      printMethod,
      status: "UNPAID",
      source: "vendor-routing+store",
      vendorRoute: routingNote,
    });
    return { ok: true, job, mock: true, reason: created.reason || "foundation_unavailable" };
  }

  return { ok: false, reason: created.reason || "persist_failed" };
}

async function createInHouseProductionJob(parsed, body, decision) {
  const note = `[Route: IN_HOUSE] ${decision.reason} (conf ${decision.confidence})`;
  return persistFoundationAndStore(parsed, body, "DTG", note);
}

async function createDtfProductionJob(parsed, body, decision) {
  const note = `[Route: DTF] ${decision.reason} (conf ${decision.confidence})`;
  return persistFoundationAndStore(parsed, body, "DTF", note);
}

function totalQtyFromJob(job) {
  const items = Array.isArray(job && job.lineItems) ? job.lineItems : [];
  const q = items.reduce((sum, it) => sum + Number((it && it.qty) || 0), 0);
  return q > 0 ? q : Number((job && job.qty) || 0) || 0;
}

/** Map merged OS job → decideRoute() input (scheduling / week planner). */
function buildVendorRouteInputFromJob(job) {
  const r = routeJob(job);
  const notes = String((job && job.notes) || "").toLowerCase();
  const material = /\bpolyester\b|\bpoly-blend\b|\b100%\s*poly\b/i.test(notes) ? "polyester" : "";
  let deadlineDays = null;
  if (job && job.dueDate) {
    const d = new Date(job.dueDate);
    if (Number.isFinite(d.getTime())) {
      deadlineDays = Math.max(0, Math.ceil((d.getTime() - Date.now()) / 86400000));
    }
  }
  return {
    quantity: r.qty || totalQtyFromJob(job),
    printColors: r.colors || 1,
    garmentType: "tees",
    material,
    deadlineDays,
    printLocations: [],
    hasArtReady: hasArtFlag(job),
  };
}

module.exports = {
  determineVendorRoute,
  detectForceBullseye,
  inferPrintColors,
  inferDeadlineDays,
  buildJobInput,
  decideRoute,
  createInHouseProductionJob,
  createDtfProductionJob,
  totalQtyFromJob,
  buildVendorRouteInputFromJob,
};
