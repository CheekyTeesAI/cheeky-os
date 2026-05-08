/**
 * Lists AcroForm field names from a PDF (for mapping bullseye-field-map.json).
 * Usage: node scripts/list-pdf-form-fields.js <path-to.pdf>
 */
const fs = require("fs");
const path = require("path");
const { PDFDocument } = require("pdf-lib");

async function main() {
  const p = process.argv[2] || path.join(__dirname, "..", "templates", "bullseye-workorder.pdf");
  if (!fs.existsSync(p)) {
    console.error("File not found:", p);
    process.exit(1);
  }
  const bytes = fs.readFileSync(p);
  const doc = await PDFDocument.load(bytes);
  const form = doc.getForm();
  const fields = form.getFields();
  for (const f of fields) {
    const n = f.getName();
    const ctor = f.constructor && f.constructor.name;
    console.log(ctor + "\t" + n);
  }
  console.log("--- total:", fields.length);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
