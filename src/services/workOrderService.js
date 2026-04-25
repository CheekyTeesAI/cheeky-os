/**
 * Bullseye work order: vendor PDF autofill (v2) + legacy pdfkit PDF (v1 fallback) + Resend.
 */
const fs = require("fs");
const path = require("path");
const os = require("os");

const PDFDocument = require("pdfkit");
const { sendWorkOrderEmail } = require("./emailService");
const { logEvent } = require("./foundationEventLog");
const { getFoundationPrisma } = require("./foundationPrisma");
const { fillBullseyePDF, templatePath } = require("./workOrderTemplateService");
const {
  detectForceBullseye,
  buildJobInput,
  decideRoute,
  createInHouseProductionJob,
  createDtfProductionJob,
} = require("./vendorRoutingService");

const COMPANY = {
  name: "Cheeky Tees",
  address: "104 Trade Street, Fountain Inn SC",
  contact: "Patrick",
};

function makeJobId() {
  return `WO-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

function workOrderDir() {
  const explicit = String(process.env.WORK_ORDER_DIR || "").trim();
  if (explicit) return explicit;
  return path.join(os.tmpdir(), "workorders");
}

function uploadsRoot() {
  const u = String(process.env.UPLOADS_DIR || "").trim();
  if (u) return path.resolve(u);
  return path.join(process.cwd(), "uploads");
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function normalize(s) {
  return String(s || "").toLowerCase();
}

function parseLocationColorParts(text) {
  const parts = [];
  const re = /(\d+)\s+colors?\s+([^,]+?)(?=\s*,\s*\d+\s+colors?|$)/gi;
  let m;
  while ((m = re.exec(text)) !== null) {
    parts.push(`${m[1]} color ${m[2].trim()}`);
  }
  return parts;
}

/**
 * Parse natural language + merge structured body.workOrder / fields.
 */
function parseWorkOrderFromCommand(text, body) {
  const b = body && typeof body === "object" ? body : {};
  const wo = b.workOrder && typeof b.workOrder === "object" ? b.workOrder : {};

  let customerName = String(wo.customerName || b.customerName || "").trim();
  let quantity = Number(wo.quantity || b.quantity) || 0;
  let product = String(wo.product || b.product || "tees").trim();
  let ink = String(wo.ink || b.ink || "").trim();
  let dueDate = wo.dueDate || b.dueDate || null;
  let notes = String(wo.notes || b.notes || "").trim();
  let printLocations = Array.isArray(wo.printLocations) ? wo.printLocations.slice() : [];
  let sizes = wo.sizes && typeof wo.sizes === "object" ? { ...wo.sizes } : null;

  let dueDateSource = "default";
  let sizesSource = "default";

  const q = normalize(text);

  const attachArt =
    wo.attachArt === true ||
    b.attachArt === true ||
    /\battach\s+art\b/i.test(text) ||
    /\bwith\s+art\b/i.test(text);

  if (!quantity) {
    const mQty = text.match(/(\d{1,5})\s*(tee|tees|shirt|shirts|hoodie|hoodies|polo|polos)/i);
    if (mQty) quantity = Number(mQty[1]);
  }

  if (!customerName) {
    const mCust = text.match(/(?:for|customer)\s+([A-Za-z][A-Za-z0-9 &'.-]{1,48}?)(?=\s*(?:,|\d+\s*tee|for\s+\d))/i);
    if (mCust) customerName = mCust[1].trim();
  }
  if (!customerName) {
    const m2 = text.match(/bullseye\s+for\s+([A-Za-z][A-Za-z0-9 &'.-]+)/i);
    if (m2) customerName = m2[1].trim();
  }
  if (!customerName) customerName = "Customer (see notes)";

  if (!ink) {
    const inkM =
      text.match(/\b(white|black|navy|red|royal)\s+ink\b/i) || text.match(/\bink[:\s]+(white|black|navy|red|royal)\b/i);
    if (inkM) ink = inkM[1].toLowerCase();
  }
  if (!ink) ink = "white";

  if (!dueDate) {
    const iso = text.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
    if (iso) {
      dueDate = iso[1];
      dueDateSource = "parsed";
    }
    const md = text.match(/\bdue\s+([A-Za-z]{3,9})\s+(\d{1,2})(?:,?\s*(20\d{2}))?\b/i);
    if (md) {
      const monthMap = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
      const mon = monthMap[md[1].toLowerCase().slice(0, 3)];
      if (mon != null) {
        const year = md[3] ? Number(md[3]) : new Date().getFullYear();
        const d = new Date(year, mon, Number(md[2]));
        dueDate = d.toISOString().slice(0, 10);
        dueDateSource = "parsed";
      }
    }
    if (!dueDate && /\bdue\s+next\s+week\b/i.test(text)) {
      const d = new Date();
      d.setDate(d.getDate() + 7);
      dueDate = d.toISOString().slice(0, 10);
      dueDateSource = "parsed";
    }
    if (!dueDate && /\bdue\s+tomorrow\b/i.test(text)) {
      const d = new Date();
      d.setDate(d.getDate() + 1);
      dueDate = d.toISOString().slice(0, 10);
      dueDateSource = "parsed";
    }
  }
  if (!dueDate) {
    const d = new Date();
    d.setDate(d.getDate() + 14);
    dueDate = d.toISOString().slice(0, 10);
    dueDateSource = "default";
  }

  const locationColorParts = parseLocationColorsFromText(text);

  if (printLocations.length === 0) {
    const locPatterns = [
      ["left chest", "Left Chest"],
      ["right chest", "Right Chest"],
      ["full rear", "Full Rear"],
      ["full back", "Full Back"],
      ["full front", "Full Front"],
      ["left sleeve", "Left Sleeve"],
      ["right sleeve", "Right Sleeve"],
      ["front", "Front"],
      ["back", "Back"],
      ["rear", "Back"],
    ];
    for (const [needle, label] of locPatterns) {
      if (q.includes(needle)) printLocations.push(label);
    }
  }
  if (locationColorParts.length && printLocations.length === 0) {
    for (const p of locationColorParts) {
      const n = normalize(p.rest);
      if (n.includes("chest") && n.includes("left")) printLocations.push("Left Chest");
      else if (n.includes("rear") || (n.includes("back") && !n.includes("front"))) printLocations.push("Back");
      else if (n.includes("front")) printLocations.push("Front");
    }
  }
  if (printLocations.length === 0) printLocations.push("As noted");
  printLocations = [...new Set(printLocations)];

  if (!sizes || Object.keys(sizes).length === 0) {
    const sizeLine = text.match(/\b([XSML]{1,2}|XL|2XL|3XL)\s*:\s*(\d+)/gi);
    if (sizeLine && sizeLine.length) {
      sizes = {};
      sizesSource = "explicit";
      for (const part of sizeLine) {
        const m = part.match(/([XSML0-9]{1,3})\s*:\s*(\d+)/i);
        if (m) sizes[m[1].toUpperCase()] = Number(m[2]);
      }
    }
  }
  if (!sizes || Object.keys(sizes).length === 0) {
    sizes = { MIXED: quantity || 1 };
    sizesSource = "mixed";
  } else {
    sizesSource = "explicit";
  }

  const instructionLine = [
    quantity && `${quantity} ${product}`,
    printLocations.join(" + "),
    `${ink} ink`,
    dueDate && `due ${dueDate}`,
  ]
    .filter(Boolean)
    .join(", ");

  const notesLine = buildBullseyeNotesLine({
    quantity,
    product,
    locationColorParts,
    printLocations,
    ink,
    fallback: notes || instructionLine,
  });

  return {
    jobName: `${customerName} — ${product}`,
    customerName,
    quantity: quantity || Object.values(sizes).reduce((a, b) => a + Number(b), 0),
    product,
    printLocations,
    ink,
    dueDate,
    dueDateSource,
    sizes,
    sizesSource,
    notes: notes || notesLine,
    notesLine,
    locationColorParts,
    pmsMatch: wo.pmsMatch === true ? "YES" : "NO",
    color: String(wo.color || b.color || "As specified").trim(),
    description: String(wo.description || `${product} — Bullseye production`).trim(),
    attachArt,
    companyName: String(wo.companyName || COMPANY.name).trim(),
    address: String(wo.address || COMPANY.address).trim(),
    contact: String(wo.contact || process.env.CHEEKY_CONTACT_NAME || COMPANY.contact).trim(),
    phone: String(wo.phone || process.env.CHEEKY_PHONE || "").trim(),
    email: String(wo.email || process.env.CHEEKY_CONTACT_EMAIL || "").trim(),
    foundationJobKey: wo.foundationJobKey || b.foundationJobKey || null,
    uploadJobId: wo.uploadJobId || null,
  };
}

function parseLocationColorsFromText(text) {
  const out = [];
  const re = /(\d+)\s+colors?\s+([^,]+)/gi;
  let m;
  while ((m = re.exec(text)) !== null) {
    out.push({ count: Number(m[1]), rest: m[2].trim() });
  }
  return out;
}

function buildBullseyeNotesLine({ quantity, product, locationColorParts, printLocations, ink, fallback }) {
  if (locationColorParts && locationColorParts.length) {
    const bits = locationColorParts.map((p) => `${p.count} color ${p.rest}`);
    return `${quantity} ${product}, ${bits.join(", ")}`;
  }
  const loc = (printLocations || []).filter((x) => x && x !== "As noted").join(", ");
  if (loc) return `${quantity} ${product}, ${loc}${ink ? `, ${ink} ink` : ""}`;
  return fallback;
}

function validateProductionWorkOrder(data) {
  const missing = [];
  if (!data.quantity || data.quantity < 1) missing.push("quantity");
  if (data.dueDateSource === "default") missing.push("due date");
  const locs = data.printLocations || [];
  const onlyPlaceholder = locs.length === 1 && locs[0] === "As noted";
  if (locs.length === 0 || onlyPlaceholder) missing.push("print locations");
  const s = data.sizes && typeof data.sizes === "object" ? data.sizes : {};
  const keys = Object.keys(s).filter((k) => Number(s[k]) > 0);
  if (keys.length === 0) missing.push("sizes");
  else {
    const sum = keys.reduce((a, k) => a + Number(s[k]), 0);
    const onlyMixed = keys.length === 1 && keys[0] === "MIXED";
    if (onlyMixed && sum !== data.quantity) missing.push("sizes (totals must match quantity)");
    if (!onlyMixed && keys.some((k) => k === "MIXED")) missing.push("sizes");
  }
  return { ok: missing.length === 0, missing };
}

async function collectArtFiles(jobId, body, parsed) {
  const paths = [];
  const seen = new Set();
  const add = (p) => {
    if (!p || !fs.existsSync(p)) return;
    const abs = path.resolve(p);
    if (seen.has(abs)) return;
    seen.add(abs);
    paths.push(abs);
  };

  const wo = body.workOrder || {};
  const artKey = wo.uploadJobId || wo.artJobId || parsed.uploadJobId || body.foundationJobKey || parsed.foundationJobKey;

  const dirs = [];
  if (artKey) dirs.push(path.join(uploadsRoot(), String(artKey)));
  dirs.push(path.join(uploadsRoot(), jobId));

  const exts = new Set([".png", ".jpg", ".jpeg", ".pdf", ".ai", ".eps", ".svg", ".tif", ".tiff"]);

  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir)) {
      const ext = path.extname(f).toLowerCase();
      if (exts.has(ext)) add(path.join(dir, f));
    }
  }

  const prisma = getFoundationPrisma();
  const fk = body.foundationJobKey || wo.foundationJobKey || parsed.foundationJobKey;
  if (prisma && fk) {
    try {
      const job = await prisma.foundationJob.findUnique({ where: { jobKey: String(fk) } });
      if (job) {
        const arts = await prisma.foundationArtFile.findMany({ where: { jobId: job.id } });
        for (const a of arts) {
          if (a.filePath) add(a.filePath);
        }
      }
    } catch (_e) {
      /* ignore */
    }
  }

  return paths;
}

function generateWorkOrderPDF(data) {
  const jobId = data.jobId || makeJobId();
  const dir = workOrderDir();
  ensureDir(dir);
  const outPath = path.join(dir, `${jobId}.pdf`);

  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: "LETTER", margin: 50 });
      const stream = fs.createWriteStream(outPath);
      doc.pipe(stream);

      doc.fontSize(18).text(COMPANY.name, { align: "center" });
      doc.moveDown(0.3);
      doc.fontSize(10).text(COMPANY.address, { align: "center" });
      doc.text(`Contact: ${COMPANY.contact}`, { align: "center" });
      doc.moveDown(1);

      doc.fontSize(14).text("WORK ORDER — Bullseye (legacy layout)", { underline: true });
      doc.moveDown(0.5);
      doc.fontSize(11);
      doc.text(`Job ID: ${jobId}`);
      doc.text(`Job name: ${data.jobName || data.customerName || "—"}`);
      doc.text(`Customer: ${data.customerName || "—"}`);
      doc.text(`Due date: ${data.dueDate || "—"}`);
      doc.text(`Ink type: ${data.ink || "—"}`);
      doc.text(`PMS match: ${data.pmsMatch || "NO"}`);
      doc.moveDown(0.8);

      doc.fontSize(12).text("Print locations", { underline: true });
      doc.moveDown(0.3);
      doc.fontSize(11);
      (Array.isArray(data.printLocations) ? data.printLocations : []).forEach((loc) => {
        doc.text(`• ${loc}`, { indent: 20 });
      });
      doc.moveDown(0.8);

      doc.fontSize(12).text("Line items", { underline: true });
      doc.moveDown(0.4);

      const tableTop = doc.y;
      const col = { item: 50, color: 130, desc: 220, sizes: 380 };
      doc.fontSize(9).text("Item", col.item, tableTop, { width: 70 });
      doc.text("Color", col.color, tableTop, { width: 80 });
      doc.text("Description", col.desc, tableTop, { width: 150 });
      doc.text("Sizes", col.sizes, tableTop, { width: 150 });
      let y = tableTop + 16;
      doc.moveTo(50, y).lineTo(550, y).stroke();
      y += 8;

      const itemLabel = String(data.product || "Garment");
      const colorStr = String(data.color || "—");
      const descStr = String(data.description || "—");
      const sizeStr =
        data.sizes && typeof data.sizes === "object"
          ? Object.entries(data.sizes)
              .map(([k, v]) => `${k}:${v}`)
              .join("  ")
          : "—";

      doc.fontSize(10).text(itemLabel, col.item, y, { width: 70 });
      doc.text(colorStr, col.color, y, { width: 80 });
      doc.text(descStr, col.desc, y, { width: 150 });
      doc.text(sizeStr, col.sizes, y, { width: 170 });
      y += 36;

      doc.moveDown(2);
      doc.fontSize(12).text("Notes / instructions", { underline: true });
      doc.moveDown(0.3);
      doc.fontSize(10).text(String(data.notesLine || data.notes || "—"), { align: "left" });

      doc.end();
      stream.on("finish", () => {
        console.log("[workOrderService] PDF written:", outPath);
        resolve(outPath);
      });
      stream.on("error", reject);
    } catch (e) {
      reject(e);
    }
  });
}

function shouldUseBullseyeTemplate() {
  if (String(process.env.WORK_ORDER_USE_TEMPLATE || "1").trim() === "0") return false;
  return fs.existsSync(templatePath());
}

function expandMixedSizesForTemplate(data) {
  const sizes = data.sizes && typeof data.sizes === "object" ? { ...data.sizes } : {};
  const keys = Object.keys(sizes).filter((k) => Number(sizes[k]) > 0);
  if (keys.length === 1 && keys[0] === "MIXED") {
    const key = String(process.env.WORK_ORDER_MIXED_SIZE_KEY || "M").toUpperCase();
    return { ...data, sizes: { [key]: sizes.MIXED } };
  }
  return data;
}

async function createPdfForWorkOrder(data) {
  const dir = workOrderDir();
  ensureDir(dir);
  const payload = expandMixedSizesForTemplate(data);
  if (shouldUseBullseyeTemplate()) {
    try {
      const p = await fillBullseyePDF(payload, dir);
      return { pdfPath: p, mode: "template" };
    } catch (e) {
      console.error("[workOrderService] template fill failed:", e && e.message ? e.message : e);
      if (String(process.env.WORK_ORDER_TEMPLATE_FALLBACK || "0").trim() === "1") {
        const pdfPath = await generateWorkOrderPDF(payload);
        return { pdfPath, mode: "legacy" };
      }
      throw e;
    }
  }
  const pdfPath = await generateWorkOrderPDF(payload);
  return { pdfPath, mode: "legacy" };
}

function buildEmailBody(data, artCount) {
  return [
    `Cheeky Tees — work order ${data.jobId}`,
    ``,
    `Job: ${data.jobName || data.customerName}`,
    `Due: ${data.dueDate}`,
    `Notes: ${data.notesLine || data.notes || ""}`,
    artCount ? `Attachments: work order PDF + ${artCount} art file(s).` : `Attachments: work order PDF.`,
    ``,
    `— Patrick, Cheeky Tees`,
  ].join("\n");
}

async function createAndSendWorkOrder(rawData, options) {
  const data = {
    ...rawData,
    jobId: rawData.jobId || makeJobId(),
  };
  const artPaths = (options && options.artPaths) || [];

  const { pdfPath, mode } = await createPdfForWorkOrder(data);
  const bullseye = String(process.env.BULLSEYE_EMAIL || "").trim();
  const subject = `Work Order - ${data.jobName || data.customerName || data.jobId}`;
  const bodyText = buildEmailBody(data, artPaths.length);

  const emailAttachments = [{ path: pdfPath, filename: `${data.jobId}-filled.pdf` }];
  if (mode === "legacy") {
    emailAttachments[0].filename = `${data.jobId}.pdf`;
  }
  for (const ap of artPaths) {
    emailAttachments.push({ path: ap, filename: path.basename(ap) });
  }

  let emailResult = { success: false, mock: true, reason: "BULLSEYE_EMAIL not set" };
  if (bullseye) {
    emailResult = await sendWorkOrderEmail({
      to: bullseye,
      subject,
      body: bodyText,
      attachments: emailAttachments,
    });
  } else {
    console.warn("[workOrderService] BULLSEYE_EMAIL missing — PDF saved, email skipped");
  }

  try {
    await logEvent(data.jobId, "WORK_ORDER", `PDF ${pdfPath} mode:${mode} art:${artPaths.length} email:${emailResult.mock ? "mock" : "sent"}`);
  } catch (_e) {
    console.log("[workOrderService] event log:", data.jobId);
  }

  const mock = Boolean(emailResult.mock || !emailResult.success);
  return {
    success: true,
    jobId: data.jobId,
    pdfPath,
    pdfMode: mode,
    attachmentCount: artPaths.length,
    email: emailResult,
    mock,
  };
}

function validateNonBullseyeRoutedJob(parsed) {
  const missing = [];
  if (!parsed.quantity || parsed.quantity < 1) missing.push("quantity");
  return { ok: missing.length === 0, missing };
}

async function runWorkOrderFromCommand(text, body) {
  const parsed = parseWorkOrderFromCommand(text, body);
  parsed.jobId = makeJobId();

  const forceBullseye = detectForceBullseye(text, body);
  const jobInput = buildJobInput(parsed, text, body);
  const routing = decideRoute(jobInput, { forceBullseye });

  const targetRoute = forceBullseye ? "BULLSEYE" : routing.route;

  if (targetRoute === "BULLSEYE") {
    const v = validateProductionWorkOrder(parsed);
    if (!v.ok) {
      return {
        validationError: true,
        missing: v.missing,
        jobId: parsed.jobId,
        routing,
      };
    }

    const artPaths = await collectArtFiles(parsed.jobId, body, parsed);
    if (parsed.attachArt && artPaths.length === 0) {
      return {
        validationError: true,
        missing: ["art files (upload to uploads/<jobKey>/ or set foundationJobKey / workOrder.uploadJobId)"],
        jobId: parsed.jobId,
        routing,
      };
    }

    const out = await createAndSendWorkOrder(parsed, { artPaths });
    return { ...out, routing, route: "BULLSEYE", jobInput };
  }

  const v2 = validateNonBullseyeRoutedJob(parsed);
  if (!v2.ok) {
    return { validationError: true, missing: v2.missing, jobId: parsed.jobId, routing };
  }

  if (targetRoute === "IN_HOUSE") {
    const created = await createInHouseProductionJob(parsed, body, routing);
    if (!created.ok) {
      return {
        success: false,
        routed: true,
        route: "IN_HOUSE",
        routing,
        jobInput,
        error: created.reason || "job_create_failed",
        jobId: parsed.jobId,
        mock: true,
      };
    }
    return {
      success: true,
      routed: true,
      route: "IN_HOUSE",
      routing,
      jobInput,
      foundationJob: created.job,
      mock: Boolean(created.mock),
      jobId: created.job && created.job.jobId ? created.job.jobId : parsed.jobId,
    };
  }

  if (targetRoute === "DTF") {
    const created = await createDtfProductionJob(parsed, body, routing);
    if (!created.ok) {
      return {
        success: false,
        routed: true,
        route: "DTF",
        routing,
        jobInput,
        error: created.reason || "job_create_failed",
        jobId: parsed.jobId,
        mock: true,
      };
    }
    return {
      success: true,
      routed: true,
      route: "DTF",
      routing,
      jobInput,
      foundationJob: created.job,
      mock: Boolean(created.mock),
      jobId: created.job && created.job.jobId ? created.job.jobId : parsed.jobId,
    };
  }

  return {
    success: false,
    route: routing.route,
    routing,
    jobInput,
    error: "unhandled_route",
    jobId: parsed.jobId,
    mock: true,
  };
}

module.exports = {
  makeJobId,
  workOrderDir,
  uploadsRoot,
  parseWorkOrderFromCommand,
  validateProductionWorkOrder,
  generateWorkOrderPDF,
  createAndSendWorkOrder,
  runWorkOrderFromCommand,
  collectArtFiles,
};
