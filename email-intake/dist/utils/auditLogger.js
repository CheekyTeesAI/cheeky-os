/**
 * Append-only audit logger with 5MB rotation.
 */
"use strict";
const fs = require("fs");
const path = require("path");
function auditPath() {
    return path.join(__dirname, "..", "..", "outputs", "revenue", "audit.log");
}
function ensure() {
    const p = auditPath();
    fs.mkdirSync(path.dirname(p), { recursive: true });
    if (!fs.existsSync(p))
        fs.writeFileSync(p, "", "utf8");
}
function rotateIfNeeded() {
    ensure();
    const p = auditPath();
    const max = 5 * 1024 * 1024;
    try {
        const st = fs.statSync(p);
        if (st.size > max) {
            const bak = `${p}.${Date.now()}.bak`;
            fs.renameSync(p, bak);
            fs.writeFileSync(p, "", "utf8");
        }
    }
    catch (_e) {
        // no-op
    }
}
function logAudit(event, data) {
    rotateIfNeeded();
    const row = {
        at: new Date().toISOString(),
        event,
        data: data || null
    };
    fs.appendFileSync(auditPath(), `${JSON.stringify(row)}\n`, "utf8");
}
module.exports = { logAudit };
