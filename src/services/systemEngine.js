const fs = require("fs");
const path = require("path");
const { readAll } = require("./storageService");

const ENV_EXAMPLE_PATH = path.join(__dirname, "..", "..", "email-intake", ".env.example");
const REQUIRED_ROUTES = [
  "POST /cheeky-ai/run",
  "POST /collections/run",
  "POST /webhooks/email-intake",
  "GET /system/health",
];

function parseEnvExampleKeys() {
  try {
    const raw = fs.readFileSync(ENV_EXAMPLE_PATH, "utf8");
    return raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => line.split("=")[0].trim())
      .filter((key) => key && /^[A-Z0-9_]+$/.test(key));
  } catch (error) {
    console.warn("[systemEngine] failed to read .env.example:", error && error.message ? error.message : error);
    return [];
  }
}

function missingEnvKeys() {
  const keys = parseEnvExampleKeys();
  return keys.filter((key) => !String(process.env[key] || "").trim());
}

function listRegisteredRoutes(app) {
  const found = new Set();

  function cleanMountPath(raw) {
    if (!raw || raw === "/") return "";
    let out = String(raw);
    out = out.replace(/\\\//g, "/");
    out = out.replace(/\(\?:\(\[\^\\\/]\+\?\)\)/g, "");
    out = out.replace(/\(\?\=\\\/\|\$\)/g, "");
    out = out.replace(/\\\/\?/g, "/");
    out = out.replace(/\$$/g, "");
    out = out.replace(/\^/g, "");
    out = out.replace(/\/\+/g, "/");
    out = out.replace(/\/{2,}/g, "/");
    if (!out.startsWith("/")) out = `/${out}`;
    if (out !== "/" && out.endsWith("/")) out = out.slice(0, -1);
    return out;
  }

  function mountFromLayer(layer) {
    if (!layer) return "";
    if (typeof layer.path === "string") return cleanMountPath(layer.path);
    if (layer.regexp && typeof layer.regexp.source === "string") {
      const src = layer.regexp.source;
      const m = src.match(/\\\/([a-zA-Z0-9_.-]+)(?:\\\/)?/);
      if (m && m[1]) return cleanMountPath(`/${m[1]}`);
    }
    return "";
  }

  function walkStack(stack, prefix) {
    if (!Array.isArray(stack)) return;
    for (const layer of stack) {
      if (layer.route && layer.route.path && layer.route.methods) {
        const methods = Object.keys(layer.route.methods).map((m) => m.toUpperCase());
        const routePath = cleanMountPath(layer.route.path);
        const fullPath = cleanMountPath(`${prefix}${routePath || ""}`) || "/";
        for (const method of methods) {
          found.add(`${method} ${fullPath}`);
        }
        continue;
      }
      if (layer.name === "router" && layer.handle && Array.isArray(layer.handle.stack)) {
        const mount = mountFromLayer(layer);
        const nextPrefix = cleanMountPath(`${prefix}${mount}`);
        walkStack(layer.handle.stack, nextPrefix);
      }
    }
  }

  try {
    const stack = app && app._router && Array.isArray(app._router.stack) ? app._router.stack : [];
    walkStack(stack, "");
  } catch (error) {
    console.warn("[systemEngine] route scan failed:", error && error.message ? error.message : error);
  }
  return Array.from(found);
}

function findBrokenRoutes(app) {
  const present = new Set(listRegisteredRoutes(app));
  return REQUIRED_ROUTES.filter((route) => !present.has(route));
}

function lastServiceError() {
  try {
    const state = readAll();
    const logs = state && state.data && Array.isArray(state.data.auditLogs) ? state.data.auditLogs : [];
    const recent = logs.slice(-10).reverse();
    const found = recent.find((row) => {
      if (!row || typeof row !== "object") return false;
      const txt = JSON.stringify(row).toLowerCase();
      return txt.includes("error") || txt.includes("failed") || txt.includes("exception");
    });
    return found || null;
  } catch (error) {
    return { event: "systemEngine_read_error", message: error && error.message ? error.message : String(error) };
  }
}

function statusFromGaps(missingKeys, brokenRoutes, lastError) {
  if ((missingKeys && missingKeys.length > 8) || (brokenRoutes && brokenRoutes.length > 0)) return "RED";
  if ((missingKeys && missingKeys.length > 0) || lastError) return "YELLOW";
  return "GREEN";
}

function getSystemHealthReport(app) {
  const missing_keys = missingEnvKeys();
  const broken_routes = findBrokenRoutes(app);
  const last_error = lastServiceError();
  const uptime = Math.floor(process.uptime());
  const status = statusFromGaps(missing_keys, broken_routes, last_error);
  return {
    status,
    missing_keys,
    broken_routes,
    last_error,
    uptime,
    checked_at: new Date().toISOString(),
  };
}

function runSystemCheck(app, extra) {
  try {
    const report = getSystemHealthReport(app);
    const gaps = [];
    if (Array.isArray(report.missing_keys) && report.missing_keys.length > 0) {
      gaps.push({ type: "missing_env", keys: report.missing_keys });
    }
    if (Array.isArray(report.broken_routes) && report.broken_routes.length > 0) {
      gaps.push({ type: "broken_routes", routes: report.broken_routes });
    }
    if (extra && typeof extra === "object") {
      if (Array.isArray(extra.datasets)) {
        for (const ds of extra.datasets) {
          if (!ds) continue;
          const count = Array.isArray(ds.items) ? ds.items.length : Number(ds.count || 0);
          if (!Number.isFinite(count) || count === 0) {
            gaps.push({ type: "empty_dataset", dataset: ds.name || "unknown" });
          }
        }
      }
    }
    return {
      health: report.status,
      gaps,
      report,
    };
  } catch (error) {
    console.error("[systemEngine] runSystemCheck failed:", error && error.message ? error.message : error);
    return {
      health: "YELLOW",
      gaps: [{ type: "system_check_error", message: error && error.message ? error.message : "unknown" }],
      report: null,
    };
  }
}

module.exports = {
  getSystemHealthReport,
  runSystemCheck,
  listRegisteredRoutes,
};
