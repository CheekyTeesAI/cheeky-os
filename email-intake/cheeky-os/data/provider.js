/**
 * Cheeky OS — Data provider.
 * Selects between local JSON store and Dataverse store based on CHEEKY_DATA_MODE.
 *
 * @module cheeky-os/data/provider
 */

const localStore = require("./local-store");
const dataverseStore = require("./dataverse-store");

const DATA_MODE = () => process.env.CHEEKY_DATA_MODE || "local";

/**
 * Get the current data mode.
 * @returns {string} "local" or "dataverse"
 */
function getMode() {
  return DATA_MODE();
}

/**
 * Resolve the active store.
 * Uses Dataverse only if mode is "dataverse" AND env vars are configured.
 * @returns {object}
 */
function resolveStore() {
  if (DATA_MODE() === "dataverse" && dataverseStore.isConfigured()) {
    return dataverseStore;
  }
  return localStore;
}

/** The selected data store — use this for all data operations. */
const store = new Proxy(
  {},
  {
    get(_target, prop) {
      const resolved = resolveStore();
      if (typeof resolved[prop] === "function") {
        return resolved[prop].bind(resolved);
      }
      return resolved[prop];
    },
  }
);

module.exports = { store, getMode };
