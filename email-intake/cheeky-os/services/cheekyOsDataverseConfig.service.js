"use strict";

/**
 * CHEEKY OS v3.2 — Single import surface for Dataverse OData naming & legacy table maps.
 * Delegates intake column resolution to dvPublisherColumns; JSON entity maps remain on dataverse-store.
 */

const dvPublisher = require("./dvPublisherColumns.service");
let store;
try {
  store = require("../data/dataverse-store");
} catch (_) {
  store = null;
}

module.exports = {
  dvPublisherColumns: dvPublisher,
  /** @type {typeof import("../data/dataverse-store")["FIELD_MAP"]|null} */
  legacyEntityFieldMaps: store && store.FIELD_MAP ? store.FIELD_MAP : {},
  invalidateDataverseTokens: () => {
    try {
      if (store && typeof store.invalidateAccessToken === "function") store.invalidateAccessToken();
    } catch (_) {}
  },
};
