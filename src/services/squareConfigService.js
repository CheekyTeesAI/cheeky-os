/**
 * Square connectivity mode — never throws.
 */

const REQUIRED_LIVE = ["SQUARE_ACCESS_TOKEN", "SQUARE_LOCATION_ID"];
const RECOMMENDED = ["SQUARE_ENVIRONMENT"];

function getSquareMode() {
  const missing = [];
  for (const k of REQUIRED_LIVE) {
    if (!String(process.env[k] || "").trim()) missing.push(k);
  }
  for (const k of RECOMMENDED) {
    if (!String(process.env[k] || "").trim()) missing.push(`${k} (optional)`);
  }

  const token = String(process.env.SQUARE_ACCESS_TOKEN || "").trim();
  const loc = String(process.env.SQUARE_LOCATION_ID || "").trim();

  if (!token) {
    return {
      configured: false,
      mode: "MOCK",
      missing: REQUIRED_LIVE.filter((k) => !String(process.env[k] || "").trim()),
    };
  }

  if (!loc) {
    return {
      configured: false,
      mode: "DEGRADED",
      missing: ["SQUARE_LOCATION_ID"],
    };
  }

  return {
    configured: true,
    mode: "LIVE",
    missing: [],
  };
}

module.exports = { getSquareMode, REQUIRED_LIVE };
