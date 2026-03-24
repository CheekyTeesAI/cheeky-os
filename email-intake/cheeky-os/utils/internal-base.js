/**
 * Base URL for HTTP calls back into this Express app (invoice proxy, control proxies).
 * Keep BASE_URL and PORT in .env aligned with where the webhook server listens.
 *
 * @module cheeky-os/utils/internal-base
 */

/**
 * @returns {string} Origin without trailing slash, e.g. http://127.0.0.1:3000
 */
function getInternalBaseUrl() {
  const fromEnv = process.env.BASE_URL;
  if (fromEnv && String(fromEnv).trim()) {
    return String(fromEnv).replace(/\/$/, "");
  }
  const raw = process.env.PORT;
  const n = raw !== undefined && raw !== "" ? parseInt(String(raw), 10) : NaN;
  const port = Number.isFinite(n) && n > 0 ? n : 3000;
  return `http://127.0.0.1:${port}`;
}

module.exports = { getInternalBaseUrl };
