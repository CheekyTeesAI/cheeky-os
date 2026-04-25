"use strict";

const fs = require("fs");
const path = require("path");

module.exports = function actionAudit(entry = {}) {
  try {
    const dir = path.join(process.cwd(), "logs");
    const file = path.join(dir, "action-audit.log");

    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const line =
      JSON.stringify({
        timestamp: new Date().toISOString(),
        ...entry,
      }) + "\n";

    fs.appendFileSync(file, line, "utf8");

    return { success: true };
  } catch (err) {
    return { success: false, error: err && err.message ? err.message : String(err) };
  }
};
