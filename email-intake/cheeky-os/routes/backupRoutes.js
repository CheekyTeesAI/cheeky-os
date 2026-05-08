"use strict";

const path = require("path");
const express = require("express");

const backupService = require("../backup/backupService");
const { safeFailureResponse } = require("../utils/safeFailureResponse");

const router = express.Router();

router.get("/api/backup/snapshot", async (req, res) => {
  try {
    const reason = String(req.query.reason || "cockpit_manual");
    const out = backupService.writeDashboardSnapshot(reason.slice(0, 180));
    const summary = backupService.getBackupStatus();
    try {
      backupService.writeLatestSnapshotMeta({
        lastReason: reason,
        lastPath: path.basename(out.path || "unknown"),
        generatedAtIso: summary.lastSnapshotAtIso,
      });
    } catch (_m) {}
    return res.json({ success: true, data: { savedPathTail: path.basename(out.path || "unknown"), backupStatusSummary: summary } });
  } catch (_e) {
    return res.status(200).json(
      Object.assign(safeFailureResponse({ safeMessage: "Snapshot halted safely.", technicalCode: "backup_snapshot_blocked" }), {
        data: { saved: false },
      })
    );
  }
});

router.get("/api/backup/status", async (_req, res) => {
  try {
    const data = backupService.getBackupStatus();
    return res.json({ success: true, data });
  } catch (_e2) {
    return res.status(200).json(
      Object.assign(safeFailureResponse({ safeMessage: "Backup status unavailable safely.", technicalCode: "backup_status_fail" }), {
        data: { directory: "unknown", lastSnapshotFilename: null },
      })
    );
  }
});

module.exports = router;
