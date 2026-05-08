/**
 * One-shot: builds templates/bullseye-workorder.pdf with AcroForm fields matching
 * templates/bullseye-field-map.json. Replace this file with Bullseye's vendor PDF
 * and update the JSON map to match vendor field names (use list-pdf-form-fields.js).
 */
const fs = require("fs");
const path = require("path");
const { PDFDocument, StandardFonts } = require("pdf-lib");

async function main() {
  const root = path.join(__dirname, "..");
  const outDir = path.join(root, "templates");
  const outPath = path.join(outDir, "bullseye-workorder.pdf");

  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([612, 792]);
  const form = pdfDoc.getForm();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

  page.drawText("BULLSEYE WORK ORDER (placeholder — replace with vendor PDF)", {
    x: 50,
    y: 760,
    size: 9,
    font,
  });

  const addText = (name, x, y, w = 220, h = 18) => {
    const f = form.createTextField(name);
    f.setText("");
    f.addToPage(page, { x, y, width: w, height: h });
  };

  const addCheck = (name, x, y) => {
    const cb = form.createCheckBox(name);
    cb.addToPage(page, { x, y, width: 14, height: 14 });
  };

  addText("CompanyName", 50, 700);
  addText("Address", 50, 670);
  addText("Contact", 50, 640);
  addText("Phone", 50, 610);
  addText("Email", 50, 580);
  addText("JobName", 50, 520);
  addText("DueDate", 50, 490);

  page.drawText("Left Chest", { x: 50, y: 455, size: 8, font });
  addCheck("LocLeftChest", 130, 452);
  page.drawText("Front", { x: 170, y: 455, size: 8, font });
  addCheck("LocFront", 220, 452);
  page.drawText("Back", { x: 260, y: 455, size: 8, font });
  addCheck("LocBack", 300, 452);

  page.drawText("Ink Solid", { x: 50, y: 420, size: 8, font });
  addCheck("InkSolid", 120, 417);
  page.drawText("PMS Match", { x: 160, y: 420, size: 8, font });
  addCheck("PMSMatch", 240, 417);

  addText("SizeS", 50, 370, 40, 16);
  addText("SizeM", 100, 370, 40, 16);
  addText("SizeL", 150, 370, 40, 16);
  addText("SizeXL", 200, 370, 40, 16);
  addText("Size2XL", 250, 370, 50, 16);
  addText("Size3XL", 310, 370, 50, 16);

  const notes = form.createTextField("Notes");
  notes.setText("");
  notes.addToPage(page, { x: 50, y: 250, width: 500, height: 90 });

  const pdfBytes = await pdfDoc.save();
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(outPath, pdfBytes);
  console.log("Wrote", outPath);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
