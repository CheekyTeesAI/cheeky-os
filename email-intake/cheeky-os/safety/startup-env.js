/**
 * Central startup env hints — never throws.
 * @module cheeky-os/safety/startup-env
 */

function printStartupEnvHints() {
  const optional = [];

  if (!process.env.DATAVERSE_URL) optional.push("DATAVERSE_URL (+ tenant/client for Dataverse intake)");
  if (!process.env.AZURE_TENANT_ID || !process.env.OUTLOOK_USER_EMAIL) {
    optional.push("AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET, OUTLOOK_USER_EMAIL (email poller)");
  }
  if (!process.env.SQUARE_ACCESS_TOKEN) optional.push("SQUARE_ACCESS_TOKEN (+ optional SQUARE_LOCATION_ID, SQUARE_ENVIRONMENT)");

  if (optional.length) {
    console.log("  ℹ️  Optional services (not set — features degrade gracefully):");
    optional.forEach((line) => console.log(`     • ${line}`));
  }
}

/**
 * @returns {{ cashEngine: string }}
 */
function getEngineReadinessFlags() {
  const hasBase =
    !!(process.env.BASE_URL || process.env.API_BASE_URL || process.env.PORT);
  return {
    cashEngine: hasBase ? "ready (uses /cheeky/data/snapshot)" : "degraded — set BASE_URL/API_BASE_URL",
  };
}

module.exports = { printStartupEnvHints, getEngineReadinessFlags };
