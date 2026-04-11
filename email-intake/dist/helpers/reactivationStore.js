/**
 * Reactivation queue storage helpers.
 */
"use strict";
const fs = require("fs");
const path = require("path");
function dir() {
    return path.join(__dirname, "..", "..", "outputs", "reactivation");
}
function queuePath() {
    return path.join(dir(), "reactivation-queue.json");
}
function convPath() {
    return path.join(dir(), "conversions.json");
}
function ensure() {
    fs.mkdirSync(dir(), { recursive: true });
    if (!fs.existsSync(queuePath())) {
        fs.writeFileSync(queuePath(), JSON.stringify({ updatedAt: new Date().toISOString(), items: [] }, null, 2), "utf8");
    }
    if (!fs.existsSync(convPath())) {
        fs.writeFileSync(convPath(), JSON.stringify({ updatedAt: new Date().toISOString(), items: [] }, null, 2), "utf8");
    }
}
function readQueue() {
    ensure();
    try {
        const p = JSON.parse(fs.readFileSync(queuePath(), "utf8"));
        return Array.isArray(p.items) ? p.items : [];
    }
    catch (_e) {
        return [];
    }
}
function writeQueue(items) {
    ensure();
    fs.writeFileSync(queuePath(), JSON.stringify({ updatedAt: new Date().toISOString(), items }, null, 2), "utf8");
}
function appendQueue(itemsIn) {
    const existing = readQueue();
    const seen = new Set(existing.map((x) => `${x.customerId}|${x.subject}|${x.text}`));
    for (const it of itemsIn || []) {
        const k = `${it.customerId}|${it.subject}|${it.text}`;
        if (seen.has(k))
            continue;
        seen.add(k);
        existing.push(it);
    }
    writeQueue(existing);
    return existing;
}
function updateStatus(id, status, err) {
    const all = readQueue();
    const it = all.find((x) => x.id === id);
    if (!it)
        return null;
    it.status = status;
    it.updatedAt = new Date().toISOString();
    it.sendError = err || null;
    writeQueue(all);
    return it;
}
function readConversions() {
    ensure();
    try {
        const p = JSON.parse(fs.readFileSync(convPath(), "utf8"));
        return Array.isArray(p.items) ? p.items : [];
    }
    catch (_e) {
        return [];
    }
}
function appendConversion(item) {
    const items = readConversions();
    items.push(item);
    fs.writeFileSync(convPath(), JSON.stringify({ updatedAt: new Date().toISOString(), items }, null, 2), "utf8");
}
module.exports = {
    queuePath,
    convPath,
    readQueue,
    writeQueue,
    appendQueue,
    updateStatus,
    readConversions,
    appendConversion
};
