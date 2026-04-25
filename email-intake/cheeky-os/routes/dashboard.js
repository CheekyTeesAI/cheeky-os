const express = require("express");
const fs = require("fs");
const path = require("path");

const router = express.Router();

function safeRead(filePath) {
  try {
    return fs.readFileSync(filePath, "utf-8");
  } catch (e) {
    return null;
  }
}

router.get("/data", (req, res) => {
  const today = new Date().toISOString().split("T")[0];

  const operatorPath = path.join(__dirname, "../outputs/reports/operator-" + today + ".md");
  const cashPath = path.join(__dirname, "../intel/cash-at-risk.md");
  const callListPath = path.join(__dirname, "../outputs/call-lists/" + today + ".md");
  const contactsPath = path.join(__dirname, "../memory/contacts.json");

  res.json({
    operator: safeRead(operatorPath),
    cash: safeRead(cashPath),
    calls: safeRead(callListPath),
    contacts: JSON.parse(safeRead(contactsPath) || "{}")
  });
});

router.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "..", "public", "dashboard.html"));
});

module.exports = router;
