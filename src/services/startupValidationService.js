/**
 * Startup validation — directories, DB probes, subsystem env grouping.
 */
const fs = require("fs");
const path = require("path");
const { ensureDirectories } = require("../utils/ensureDirectories");
const { getConfigStatus } = require("./configStatusService");
const { isFoundationDbAvailable, getFoundationPrisma } = require("./foundationPrisma");

let _lastResult = null;

function publicUiDirExists() {
  const candidates = [
    path.join(process.cwd(), "public"),
    path.join(process.cwd(), "email-intake", "public"),
  ];
  return candidates.some((p) => {
    try {
      return fs.existsSync(p) && fs.statSync(p).isDirectory();
    } catch (_e) {
      return false;
    }
  });
}

function testDataWritable() {
  const dir = path.join(process.cwd(), "data");
  const probe = path.join(dir, `.write-probe-${Date.now()}.tmp`);
  try {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(probe, "ok", "utf8");
    fs.unlinkSync(probe);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e && e.message ? e.message : String(e) };
  }
}

async function probeFoundationDb() {
  if (!isFoundationDbAvailable()) {
    return { ok: false, note: "foundation_prisma_unavailable" };
  }
  const prisma = getFoundationPrisma();
  if (!prisma || typeof prisma.$queryRaw !== "function") {
    return { ok: false, note: "no_client" };
  }
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { ok: true };
  } catch (e) {
    return { ok: false, note: e && e.message ? e.message : "query_failed" };
  }
}

async function probePostgresIfPresent() {
  const url = String(process.env.DATABASE_URL || "").trim();
  if (!url) return { skipped: true };
  try {
    const modPath = path.join(process.cwd(), "node_modules", "@prisma", "client");
    if (!fs.existsSync(modPath)) return { ok: false, note: "prisma_client_missing" };
    const { PrismaClient } = require("@prisma/client");
    const prisma = new PrismaClient();
    await prisma.$queryRaw`SELECT 1`;
    await prisma.$disconnect();
    return { ok: true };
  } catch (e) {
    return { ok: false, note: e && e.message ? e.message : "postgres_probe_failed" };
  }
}

/**
 * @param {import("express").Application} [app]
 */
async function runStartupValidation(app) {
  const critical = [];
  const warnings = [];
  const info = [];
  const subsystemStatus = {};

  const dirResult = ensureDirectories();
  if (dirResult.errors.length) {
    critical.push(`directory_create_failed: ${dirResult.errors.join("; ")}`);
  } else {
    info.push(`directories_ok created=${dirResult.created.length}`);
  }

  const w = testDataWritable();
  if (!w.ok) {
    critical.push(`data_dir_not_writable: ${w.error || "unknown"}`);
  }

  if (!publicUiDirExists()) {
    warnings.push("public_ui_directory_not_found (static UI may be unavailable)");
  }

  const cfg = getConfigStatus();
  subsystemStatus.config = cfg;
  if (!cfg.square.configured) warnings.push("square: not fully configured (degraded money features)");
  if (!cfg.email.configured) warnings.push("email: not fully configured (degraded intake/email)");
  if (!cfg.sms.configured) warnings.push("sms: not fully configured");

  const fdb = await probeFoundationDb();
  subsystemStatus.foundationDb = fdb;
  if (!fdb.ok && fdb.note !== "foundation_prisma_unavailable") {
    warnings.push(`foundation_db: ${fdb.note}`);
  } else if (fdb.ok) {
    info.push("foundation_db: ok");
  } else {
    info.push("foundation_db: optional client not generated");
  }

  const pg = await probePostgresIfPresent();
  subsystemStatus.postgres = pg;
  if (!pg.skipped && !pg.ok) {
    warnings.push(`postgres: ${pg.note}`);
  } else if (pg.ok) {
    info.push("postgres: ok");
  }

  if (app && app._router && app._router.stack) {
    const paths = new Set();
    try {
      for (const layer of app._router.stack) {
        if (layer && layer.route && layer.route.path) {
          paths.add(String(layer.route.path));
        }
      }
    } catch (_e) {
      /* ignore */
    }
    subsystemStatus.routeSample = { count: paths.size };
    if (paths.size < 3) {
      warnings.push("express_route_stack_looks_thin (non-fatal)");
    }
  }

  const ok = critical.length === 0;
  const out = {
    ok,
    critical,
    warnings,
    info,
    subsystemStatus,
    timestamp: new Date().toISOString(),
  };
  _lastResult = out;
  return out;
}

function getLastStartupValidation() {
  return _lastResult;
}

module.exports = {
  runStartupValidation,
  getLastStartupValidation,
};
