const fs = require("fs");
const path = require("path");

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function readSafe(filePath) {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return "";
  }
}

function listOrderFiles(dirPath) {
  try {
    return fs
      .readdirSync(dirPath)
      .filter((x) => x.endsWith(".md") && x !== ".gitkeep")
      .map((x) => path.join(dirPath, x));
  } catch {
    return [];
  }
}

function orderName(md, file) {
  return md.match(/^#\s+(.+)$/m)?.[1]?.trim() || path.basename(file, ".md").replace(/-/g, " ");
}

function needsDeposit(md) {
  const low = md.toLowerCase();
  const hasRequired = /deposit_required\s*:\s*([1-9]\d*|[0-9]+\.[0-9]+)/i.test(md) || /deposit required/i.test(low);
  const notReceived = /deposit_received\s*:\s*0/i.test(md) || /deposit received\s*:\s*false/i.test(low) || /deposit not received/i.test(low);
  return hasRequired && notReceived;
}

function generateDepositPush() {
  const root = path.join(__dirname, "../../");
  const orderFiles = listOrderFiles(path.join(root, "memory/orders"));
  const salesMd = readSafe(path.join(root, "intel/sales-opportunities.md")).toLowerCase();
  const targets = [];

  for (const file of orderFiles) {
    const md = readSafe(file);
    if (needsDeposit(md)) {
      targets.push(orderName(md, file));
    }
  }

  if (targets.length === 0 && /deposit/i.test(salesMd)) {
    targets.push("there");
  }

  const top = [...new Set(targets)].slice(0, 5);
  const body = `## DEPOSIT REQUESTS

---

${top
  .map(
    (name) => `### ${name}

Message:
"Hey ${name} — we’re ready to get your order into production.
Once we get the deposit in, we’ll lock everything in and get it moving.

Want me to resend the invoice?"

---`
  )
  .join("\n\n") || "### None\n\nMessage:\n\"Hey there — we’re ready to get your order into production.\nOnce we get the deposit in, we’ll lock everything in and get it moving.\n\nWant me to resend the invoice?\"\n\n---"}
`;

  const outPath = path.join(root, "outputs/email-drafts", `deposits-${todayIso()}.md`);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, body, "utf8");
  return { generated: top.length, path: outPath };
}

module.exports = generateDepositPush;
