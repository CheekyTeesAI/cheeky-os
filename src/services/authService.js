/**
 * Request identity — backend only. Headers optional unless CHEEKY_SECURITY_ENABLED=true.
 */
const ROLES = ["OWNER", "PRINTER", "ADMIN", "DESIGN"];

function normalizeRole(r) {
  const x = String(r || "OWNER").toUpperCase().trim();
  if (x === "PRINT" || x === "JEREMY") return "PRINTER";
  return ROLES.includes(x) ? x : "ADMIN";
}

/**
 * @param {import("express").Request} req
 * @returns {{ userId: string, name: string, role: string, active: boolean } | null}
 */
function getUserFromRequest(req) {
  const strict = String(process.env.CHEEKY_SECURITY_ENABLED || "").toLowerCase() === "true";
  const id = (req.get("x-cheeky-user-id") || req.get("X-Cheeky-User-Id") || "").trim();
  const roleRaw = (req.get("x-cheeky-role") || req.get("X-Cheeky-Role") || "").trim();
  const name = (req.get("x-cheeky-user-name") || req.get("X-Cheeky-User-Name") || "").trim() || id || "user";

  if (!id && strict) {
    return null;
  }

  if (!id) {
    return {
      userId: String(process.env.CHEEKY_DEFAULT_USER_ID || "local"),
      name: String(process.env.CHEEKY_DEFAULT_USER_NAME || "Local"),
      role: normalizeRole(process.env.CHEEKY_DEFAULT_ROLE || "OWNER"),
      active: true,
    };
  }

  return {
    userId: id,
    name: name || id,
    role: normalizeRole(roleRaw || "OWNER"),
    active: true,
  };
}

/**
 * Express middleware — one of allowed roles (uppercase).
 * @param {...string} roles
 */
function requireRole(...roles) {
  const allow = new Set(roles.map((r) => String(r).toUpperCase()));
  return (req, res, next) => {
    const strict = String(process.env.CHEEKY_SECURITY_ENABLED || "").toLowerCase() === "true";
    const user = getUserFromRequest(req);
    if (!user) {
      return res.status(401).json({ success: false, error: "unauthorized", reason: "missing_identity_headers" });
    }
    if (!strict) return next();
    if (!allow.has(user.role)) {
      return res.status(403).json({ success: false, error: "forbidden", reason: "role_not_allowed", role: user.role });
    }
    return next();
  };
}

function requireOwner() {
  return requireRole("OWNER");
}

function securityEnabled() {
  return String(process.env.CHEEKY_SECURITY_ENABLED || "").toLowerCase() === "true";
}

/**
 * Identity for POST /command (no Express req) — optional userId/role on body.
 * @param {object} body
 */
function getUserFromCommandContext(body) {
  const b = body && typeof body === "object" ? body : {};
  const strict = securityEnabled();
  const id = String(b.userId || b.operatorId || "").trim();
  const roleRaw = String(b.role || "").trim();
  const name = String(b.name || "").trim() || id || "command";

  if (!id && strict) {
    return null;
  }
  if (!id) {
    return {
      userId: String(process.env.CHEEKY_DEFAULT_USER_ID || "command"),
      name: String(process.env.CHEEKY_DEFAULT_USER_NAME || "Command"),
      role: normalizeRole(process.env.CHEEKY_DEFAULT_ROLE || "OWNER"),
      active: true,
    };
  }
  return {
    userId: id,
    name,
    role: normalizeRole(roleRaw || "OWNER"),
    active: true,
  };
}

module.exports = {
  getUserFromRequest,
  getUserFromCommandContext,
  requireRole,
  requireOwner,
  normalizeRole,
  ROLES,
  securityEnabled,
};
