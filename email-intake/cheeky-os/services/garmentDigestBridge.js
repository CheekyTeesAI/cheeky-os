/**
 * Optional PostgreSQL garment digest for daily summary / automation (requires dist build).
 */

const path = require("path");

/**
 * @returns {Promise<{ garmentOrdersPending: number, garmentOrdersOrderedAwaitingReceive: number, productionReadyMissingGarmentTask: number } | null>}
 */
async function tryGarmentDigestSnapshot() {
  try {
    const m = require(path.join(
      __dirname,
      "..",
      "..",
      "dist",
      "services",
      "garmentOperatorService.js"
    ));
    if (m && typeof m.getGarmentDigestSnapshot === "function") {
      return await m.getGarmentDigestSnapshot();
    }
  } catch {
    /* dist missing or DB unavailable */
  }
  return null;
}

module.exports = { tryGarmentDigestSnapshot };
