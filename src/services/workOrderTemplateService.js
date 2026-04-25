/**
 * Bullseye vendor PDF autofill (pdf-lib). Field names are driven by templates/bullseye-field-map.json
 * so you can swap in the real Bullseye form without code changes.
 */
const fs = require("fs");
const path = require("path");
const { PDFDocument } = require("pdf-lib");

function repoRoot() {
  return path.join(__dirname, "..", "..");
}

function templatePath() {
  const p = String(process.env.BULLSEYE_TEMPLATE_PATH || "").trim();
  if (p) return p;
  return path.join(repoRoot(), "templates", "bullseye-workorder.pdf");
}

function fieldMapPath() {
  const p = String(process.env.BULLSEYE_FIELD_MAP_PATH || "").trim();
  if (p) return p;
  return path.join(repoRoot(), "templates", "bullseye-field-map.json");
}

function loadFieldMap() {
  const fp = fieldMapPath();
  if (!fs.existsSync(fp)) {
    throw new Error(`Bullseye field map missing: ${fp}`);
  }
  const raw = JSON.parse(fs.readFileSync(fp, "utf8"));
  return raw;
}

function trySetText(form, name, value) {
  if (!name) return;
  try {
    const f = form.getTextField(name);
    f.setText(value == null ? "" : String(value));
  } catch (_e) {
    console.warn("[workOrderTemplateService] skip text field:", name);
  }
}

function trySetCheckbox(form, name, checked) {
  if (!name) return;
  try {
    const cb = form.getCheckBox(name);
    if (checked) cb.check();
    else cb.uncheck();
  } catch (_e) {
    console.warn("[workOrderTemplateService] skip checkbox:", name);
  }
}

function normalizeLocLabel(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Map parsed print locations to Left Chest / Front / Back checkboxes.
 */
function locationFlags(printLocations) {
  const q = (printLocations || []).map(normalizeLocLabel).join(" | ");
  const leftChest = /left chest|l\.?\s*c\.?|lc\b/.test(q);
  const front = /(^|[^a-z])front|full front|left front|right front/.test(q);
  const back = /(^|[^a-z])back|rear|full back|full rear/.test(q);
  return { leftChest, front, back };
}

/**
 * Fill the Bullseye PDF template. Returns absolute path to {jobId}-filled.pdf
 * @param {object} data - merged work order payload + jobId
 * @param {string} outDir - same as workOrderDir()
 */
async function fillBullseyePDF(data, outDir) {
  const tpl = templatePath();
  if (!fs.existsSync(tpl)) {
    throw new Error(`Bullseye template not found: ${tpl}`);
  }

  const map = loadFieldMap();
  const bytes = fs.readFileSync(tpl);
  const pdfDoc = await PDFDocument.load(bytes);
  const form = pdfDoc.getForm();

  const companyName = String(process.env.CHEEKY_BIZ_NAME || data.companyName || "Cheeky Tees").trim();
  const addressLine = String(process.env.CHEEKY_ADDRESS || data.address || "104 Trade Street, Fountain Inn SC").trim();
  const contact = String(process.env.CHEEKY_CONTACT_NAME || data.contact || "Patrick").trim();
  const phone = String(process.env.CHEEKY_PHONE || data.phone || "").trim();
  const email = String(process.env.CHEEKY_CONTACT_EMAIL || data.email || "").trim();

  trySetText(form, map.companyName, companyName);
  trySetText(form, map.address, addressLine);
  trySetText(form, map.contact, contact);
  trySetText(form, map.phone, phone);
  trySetText(form, map.email, email);

  trySetText(form, map.jobName, data.jobName || data.customerName || "");
  trySetText(form, map.dueDate, data.dueDate || "");

  const loc = map.locations || {};
  const flags = locationFlags(data.printLocations);
  trySetCheckbox(form, loc.leftChest, flags.leftChest);
  trySetCheckbox(form, loc.front, flags.front);
  trySetCheckbox(form, loc.back, flags.back);

  const pmsYes = String(data.pmsMatch || "").toUpperCase() === "YES";
  trySetCheckbox(form, map.inkSolid, true);
  trySetCheckbox(form, map.pmsMatch, pmsYes);

  const sizeMap = map.sizes && typeof map.sizes === "object" ? map.sizes : {};
  const sizes = data.sizes && typeof data.sizes === "object" ? data.sizes : {};
  for (const [k, fieldName] of Object.entries(sizeMap)) {
    const v = sizes[k];
    if (v != null && v !== "") trySetText(form, fieldName, String(v));
  }

  const notes = String(data.notes || data.notesLine || "").trim();
  trySetText(form, map.notes, notes);

  if (String(process.env.WORK_ORDER_FLATTEN_PDF || "").trim() === "1") {
    try {
      form.flatten();
    } catch (_e) {
      /* vendor PDFs may reject flatten */
    }
  }

  const jobId = String(data.jobId || "WO-UNKNOWN");
  const outPath = path.join(outDir, `${jobId}-filled.pdf`);
  const outBytes = await pdfDoc.save();
  fs.writeFileSync(outPath, outBytes);
  console.log("[workOrderTemplateService] filled PDF:", outPath);
  return outPath;
}

module.exports = {
  fillBullseyePDF,
  templatePath,
  fieldMapPath,
  loadFieldMap,
  locationFlags,
};
