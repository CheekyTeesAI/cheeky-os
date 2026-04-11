/**
 * Dataverse Metadata Discovery — READ-ONLY
 * Discovers the actual logical column names for ct_orders (or ct_orderses) at runtime.
 *
 * Exports: discoverSchema(accessToken, orgUrl) → { normalized_display_name: "logical_name", ... }
 *
 * This module does NOT write anything to Dataverse. Safe for production use.
 *
 * @module metadata
 */

/**
 * Discover the attribute schema for ct_orders from the Dataverse metadata API.
 * Tries 'ct_orders' first; if 404, retries with 'ct_orderses'.
 *
 * @param {string} accessToken - Bearer token for Dataverse.
 * @param {string} orgUrl      - Dataverse org URL (e.g. https://org143bbb56.crm.dynamics.com).
 * @returns {Promise<Object>} Map of normalized display names → logical names.
 * @throws {Error} If both entity names return non-200 responses.
 */
async function discoverSchema(accessToken, orgUrl) {
  var entityNames = ["ct_orders", "ct_orderses"];
  var data = null;

  for (var i = 0; i < entityNames.length; i++) {
    var entityName = entityNames[i];
    var url = orgUrl + "/api/data/v9.2/EntityDefinitions(LogicalName='" + entityName + "')/Attributes"
      + "?$select=LogicalName,DisplayName,AttributeType"
      + "&$filter=AttributeType ne Microsoft.Dynamics.CRM.AttributeTypeCode'Virtual'";

    var res = await fetch(url, {
      method: "GET",
      headers: {
        "Authorization": "Bearer " + accessToken,
        "OData-MaxVersion": "4.0",
        "OData-Version": "4.0",
        "Accept": "application/json",
      },
    });

    if (res.ok) {
      data = await res.json();
      console.log("[METADATA] Found entity: " + entityName);
      break;
    }

    if (res.status === 404 && i < entityNames.length - 1) {
      console.log("[METADATA] Entity '" + entityName + "' not found (404), trying next...");
      continue;
    }

    var errText = await res.text();
    throw new Error("Metadata request failed for '" + entityName + "' (" + res.status + "): " + errText.slice(0, 300));
  }

  if (!data || !data.value) {
    throw new Error("No attribute metadata returned from Dataverse");
  }

  var schemaMap = {};
  var attributes = data.value;

  for (var j = 0; j < attributes.length; j++) {
    var attr = attributes[j];
    var logicalName = attr.LogicalName || "";
    var displayLabel = null;

    if (
      attr.DisplayName &&
      attr.DisplayName.UserLocalizedLabel &&
      attr.DisplayName.UserLocalizedLabel.Label
    ) {
      displayLabel = attr.DisplayName.UserLocalizedLabel.Label;
    }

    if (displayLabel) {
      var normalized = displayLabel.toLowerCase().replace(/\s+/g, "_");
      schemaMap[normalized] = logicalName;
    }

    // Also map logical name to itself for direct lookups
    schemaMap[logicalName] = logicalName;
  }

  console.log("");
  console.log("=".repeat(55));
  console.log("  [METADATA] Schema Map (" + Object.keys(schemaMap).length + " entries)");
  console.log("=".repeat(55));
  var keys = Object.keys(schemaMap);
  for (var k = 0; k < keys.length; k++) {
    console.log("  " + keys[k] + " → " + schemaMap[keys[k]]);
  }
  console.log("=".repeat(55));
  console.log("");

  return schemaMap;
}

module.exports = { discoverSchema };
