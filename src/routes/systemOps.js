/**
 * Deployment / backup / bootstrap HTTP routes (additive).
 */
const express = require("express");
const { runStartupValidation } = require("../services/startupValidationService");
const { getConfigStatus } = require("../services/configStatusService");
const { getBuildInfo } = require("../services/buildInfoService");
const { buildSystemBackup, listBackups, getBackupById } = require("../services/backupService");
const { validateBackupFile } = require("../services/restoreValidationService");
const { previewRestore, restoreBackup, resolveSafePath } = require("../services/restoreService");
const { bootstrapSystem } = require("../services/bootstrapService");
const { logOpsEvent } = require("../services/opsEventLog");

const router = express.Router();

router.get("/startup-check", async (_req, res) => {
  try {
    const out = await runStartupValidation();
    await logOpsEvent("STARTUP_CHECK_HTTP", `ok=${out.ok} critical=${out.critical.length}`);
    return res.status(200).json({ success: true, ...out });
  } catch (e) {
    return res.status(200).json({
      success: false,
      ok: false,
      error: e && e.message ? e.message : "startup_check_failed",
    });
  }
});

router.get("/config", (_req, res) => {
  try {
    return res.status(200).json({ success: true, ...getConfigStatus() });
  } catch (e) {
    return res.status(200).json({ success: false, error: e && e.message ? e.message : "config_status_failed" });
  }
});

router.get("/build-info", (_req, res) => {
  try {
    return res.status(200).json({ success: true, ...getBuildInfo() });
  } catch (e) {
    return res.status(200).json({ success: false, error: e && e.message ? e.message : "build_info_failed" });
  }
});

router.post("/bootstrap", async (_req, res) => {
  try {
    const out = bootstrapSystem();
    await logOpsEvent("BOOTSTRAP", `created=${out.created.length} skipped=${out.skipped.length}`);
    return res.status(200).json({ success: true, ...out });
  } catch (e) {
    return res.status(200).json({
      success: false,
      error: e && e.message ? e.message : "bootstrap_failed",
    });
  }
});

router.get("/backup", (_req, res) => {
  try {
    const backups = listBackups();
    return res.status(200).json({ success: true, backups, count: backups.length });
  } catch (e) {
    return res.status(200).json({ success: false, backups: [], error: e && e.message ? e.message : "list_failed" });
  }
});

router.post("/backup", async (req, res) => {
  try {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const mode = String(body.mode || "FULL").toUpperCase();
    if (mode !== "FULL") {
      return res.status(200).json({ success: false, error: "only_FULL_mode_supported" });
    }
    const out = buildSystemBackup();
    await logOpsEvent("BACKUP_CREATED", out.backupId || "");
    return res.status(200).json({ success: true, ...out });
  } catch (e) {
    return res.status(200).json({ success: false, error: e && e.message ? e.message : "backup_failed" });
  }
});

router.post("/restore/preview", async (req, res) => {
  try {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const filePath = body.filePath || body.path || "";
    const out = previewRestore(filePath);
    await logOpsEvent("RESTORE_PREVIEW", String(filePath || "").slice(0, 200));
    return res.status(200).json({ success: out.success !== false, ...out });
  } catch (e) {
    return res.status(200).json({ success: false, error: e && e.message ? e.message : "preview_failed" });
  }
});

router.post("/restore", async (req, res) => {
  try {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const filePath = body.filePath || body.path || "";
    const mode = String(body.mode || "MERGE").toUpperCase();
    const groups = Array.isArray(body.groups) ? body.groups : [];

    if (mode === "PREVIEW") {
      const out = previewRestore(filePath);
      await logOpsEvent("RESTORE_PREVIEW", filePath);
      return res.status(200).json({ success: Boolean(out.success), ...out });
    }

    const safe = resolveSafePath(filePath);
    if (!safe) {
      return res.status(200).json({
        success: false,
        mode,
        errors: ["invalid_or_unsafe_file_path"],
      });
    }

    const val = validateBackupFile(safe);
    if (!val.valid) {
      return res.status(200).json({
        success: false,
        mode,
        errors: val.blockingIssues,
        validation: val,
      });
    }

    const out = restoreBackup(filePath, mode, { groups });
    await logOpsEvent("RESTORE_EXECUTED", `${mode} ${filePath}`);
    return res.status(200).json({ success: Boolean(out.success), ...out });
  } catch (e) {
    return res.status(200).json({
      success: false,
      error: e && e.message ? e.message : "restore_failed",
    });
  }
});

router.get("/backup/:id", (req, res) => {
  try {
    const id = String(req.params.id || "").trim();
    const p = getBackupById(id);
    if (!p) {
      return res.status(200).json({ success: false, error: "not_found" });
    }
    return res.status(200).json({ success: true, path: p, backupId: id });
  } catch (e) {
    return res.status(200).json({ success: false, error: e && e.message ? e.message : "error" });
  }
});

module.exports = router;
