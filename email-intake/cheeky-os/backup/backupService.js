"use strict";

const fs = require("fs");
const path = require("path");

const taskQueue = require("../agent/taskQueue");

function backupSnapshotsDir() {
  taskQueue.ensureDirAndFiles();
  const dir = path.join(taskQueue.DATA_DIR, "backup-snapshots");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Snapshot critical JSON artefacts on demand — no uploads, no schedulers.
 */
function writeDashboardSnapshot(reason) {
  const dir = backupSnapshotsDir();
  const stamp = Date.now();

  /** @type {string[]} */
  const filesToPack = [
    "pending-approvals.json",
    "approval-history.json",
    "friction-log.json",
    "square-snapshot.json",
    "morning-brief-cache.json",
    "lead-scores.json",
    "kpi-history.json",
    "jeremy-playbook.md",
    "shift-handoffs.json",
    "intake-self-service-queue.json",
    "customer-status-links.json",
  ];

  /** @type {Record<string,string|object|string>} */
  const payload = {
    reason: String(reason || "manual_dashboard_snapshot"),
    savedAtIso: new Date().toISOString(),
    artefacts: {},
    missingPaths: [],
  };

  filesToPack.forEach((rel) => {
    const fp = path.join(taskQueue.DATA_DIR, rel);
    if (!fs.existsSync(fp)) {
      payload.missingPaths.push(rel);
      return;
    }
    try {
      if (/\.json$/i.test(rel)) payload.artefacts[rel] = JSON.parse(fs.readFileSync(fp, "utf8"));
      else payload.artefacts[rel] = fs.readFileSync(fp, "utf8").slice(0, 120000);
    } catch (_e) {
      payload.artefacts[rel] = "unreadable_placeholder";
    }
  });

  const name = `cheeky-os-snapshot-${stamp}.json`;
  const finalPath = path.join(dir, name);
  const tmp = `${finalPath}.tmp.${stamp}`;
  fs.writeFileSync(tmp, JSON.stringify(payload, null, 2), "utf8");
  fs.renameSync(tmp, finalPath);

  return {
    path: finalPath,
    meta: path.join(dir, "latest-snapshot-meta.json"),
  };
}

function writeLatestSnapshotMeta(summary) {
  const dir = backupSnapshotsDir();
  const fp = path.join(dir, "latest-snapshot-meta.json");
  const tmp = `${fp}.tmp.${Date.now()}`;
  fs.writeFileSync(tmp, JSON.stringify(summary, null, 2), "utf8");
  fs.renameSync(tmp, fp);
}

function getBackupStatus() {
  backupSnapshotsDir();
  const dir = backupSnapshotsDir();
  let latest = null;
  try {
    const files = fs
      .readdirSync(dir)
      .filter((f) => f.startsWith("cheeky-os-snapshot-") && f.endsWith(".json"))
      .map((name) => {
        const fp = path.join(dir, name);
        const stat = fs.statSync(fp);
        return { name, fp, mtimeMs: stat.mtimeMs, sizeBytes: stat.size };
      })
      .sort((a, b) => b.mtimeMs - a.mtimeMs);
    latest = files[0] || null;
  } catch (_e) {
    latest = null;
  }

  /** @type {object|null} */
  let metaDisk = null;
  try {
    const mp = path.join(dir, "latest-snapshot-meta.json");
    if (fs.existsSync(mp)) metaDisk = JSON.parse(fs.readFileSync(mp, "utf8"));
  } catch (_e2) {}

  return {
    directory: dir,
    lastSnapshotFilename: latest ? latest.name : null,
    lastSnapshotAtIso: latest ? new Date(latest.mtimeMs).toISOString() : null,
    approximateSizeBytes: latest ? latest.sizeBytes : 0,
    meta: metaDisk,
    note: latest ? null : "No snapshot yet — run GET /api/backup/snapshot on demand.",
  };
}

module.exports = {
  writeDashboardSnapshot,
  writeLatestSnapshotMeta,
  getBackupStatus,
  backupSnapshotsDir,
};
