// PHASE 3 — DATAVERSE COLUMN CHECK: Live schema validation tool
/**
 * Connects to Dataverse and reads the live ct_orderses schema.
 * Reports FOUND and MISSING columns compared to what the intake
 * pipeline expects. Useful for diagnosing 400 Bad Request errors
 * when new fields are added to the mapping.
 *
 * Run as: node dataverse/column-check.js
 *
 * All output logged to console and logs/column-check.log.
 *
 * @module dataverse/column-check
 */

require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });

const fs = require("fs");
const path = require("path");

/** Log directory and file setup. */
const LOG_DIR = path.join(__dirname, "..", "logs");
const LOG_FILE = path.join(LOG_DIR, "column-check.log");
fs.mkdirSync(LOG_DIR, { recursive: true });

/** Dataverse config from env. */
const DATAVERSE_URL = process.env.DATAVERSE_URL || "";
const DATAVERSE_TENANT_ID = process.env.DATAVERSE_TENANT_ID || "";
const DATAVERSE_CLIENT_ID = process.env.DATAVERSE_CLIENT_ID || "";
const DATAVERSE_CLIENT_SECRET = process.env.DATAVERSE_CLIENT_SECRET || "";

/**
 * Build a formatted timestamp string for log entries.
 * @returns {string} Timestamp in YYYY-MM-DD HH:mm:ss format.
 */
function timestamp() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return (
    `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ` +
    `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`
  );
}

/**
 * Log a message to both console and the column-check log file.
 * @param {string} level - Log level (INFO, WARN, ERROR).
 * @param {string} msg   - Message text.
 */
function log(level, msg) {
  const line = `[${timestamp()}] ${level} | ${msg}`;
  console.log(msg);
  try {
    fs.appendFileSync(LOG_FILE, line + "\n");
  } catch {
    // Silent fail
  }
}

/**
 * Get a Dataverse access token via client credentials or env token.
 * @returns {Promise<string>} Bearer access token.
 */
async function getToken() {
  // Token mode
  if (process.env.DATAVERSE_TOKEN) {
    return process.env.DATAVERSE_TOKEN;
  }

  // Client credentials mode
  const missing = [];
  if (!DATAVERSE_URL) missing.push("DATAVERSE_URL");
  if (!DATAVERSE_TENANT_ID) missing.push("DATAVERSE_TENANT_ID");
  if (!DATAVERSE_CLIENT_ID) missing.push("DATAVERSE_CLIENT_ID");
  if (!DATAVERSE_CLIENT_SECRET) missing.push("DATAVERSE_CLIENT_SECRET");

  if (missing.length > 0) {
    throw new Error(`Missing env vars: ${missing.join(", ")}. Set them in .env.`);
  }

  const tokenUrl = `https://login.microsoftonline.com/${DATAVERSE_TENANT_ID}/oauth2/v2.0/token`;
  const params = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: DATAVERSE_CLIENT_ID,
    client_secret: DATAVERSE_CLIENT_SECRET,
    scope: `${DATAVERSE_URL}/.default`,
  });

  const res = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Token request failed (${res.status}): ${errText}`);
  }

  const data = await res.json();
  return data.access_token;
}

/**
 * The columns the intake pipeline expects to exist on ct_orders.
 * Each entry has the extracted field name and the expected ct_ column name(s).
 * @type {Array<{field: string, expectedColumns: string[]}>}
 */
const EXPECTED_COLUMNS = [
  { field: "customerName", expectedColumns: ["ct_customername", "ct_ordername", "ct_name"] },
  { field: "email",        expectedColumns: ["ct_customeremail", "ct_emailaddress", "ct_email"] },
  { field: "phone",        expectedColumns: ["ct_customerphone", "ct_phonenumber", "ct_phone"] },
  { field: "product",      expectedColumns: ["ct_garmenttype", "ct_producttype", "ct_product"] },
  { field: "quantity",     expectedColumns: ["ct_quantity", "ct_qty", "ct_orderquantity"] },
  { field: "sizes",        expectedColumns: ["ct_sizes", "ct_sizedetails", "ct_sizebreakdown"] },
  { field: "printType",    expectedColumns: ["ct_productiontype", "ct_printtype", "ct_printmethod"] },
  { field: "notes",        expectedColumns: ["ct_notes", "ct_ordernotes", "ct_comments"] },
  { field: "deadline",     expectedColumns: ["ct_duedate", "ct_deadline", "ct_deliverydate"] },
];

/**
 * Run the column check against live Dataverse metadata.
 * Fetches all columns on ct_orders, then checks each expected column.
 * @returns {Promise<{found: Array, missing: Array, allColumns: string[]}>}
 */
async function runColumnCheck() {
  log("INFO", "");
  log("INFO", "═══════════════════════════════════════════════════════════");
  log("INFO", "  🔍 Cheeky Tees — Dataverse Column Check");
  log("INFO", `  Target: ${DATAVERSE_URL}`);
  log("INFO", `  Table:  ct_orders (entity set: ct_orderses)`);
  log("INFO", "═══════════════════════════════════════════════════════════");
  log("INFO", "");

  // Step 1: Get token
  log("INFO", "Authenticating...");
  const token = await getToken();
  log("INFO", "✅ Authenticated successfully.");
  log("INFO", "");

  // Step 2: Fetch all columns on ct_orders
  const headers = {
    Authorization: `Bearer ${token}`,
    "OData-MaxVersion": "4.0",
    "OData-Version": "4.0",
    Accept: "application/json",
  };

  const attrsUrl =
    `${DATAVERSE_URL}/api/data/v9.2/EntityDefinitions(LogicalName='ct_orders')/Attributes` +
    `?$select=LogicalName,DisplayName,AttributeTypeName,IsValidForCreate`;

  log("INFO", "Fetching column metadata...");
  const res = await fetch(attrsUrl, { method: "GET", headers });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Metadata request failed (${res.status}): ${errText}`);
  }

  const data = await res.json();
  const allAttrs = data.value || [];

  // Build lookup set of all logical names (lowercase)
  const columnSet = new Set(allAttrs.map((a) => a.LogicalName.toLowerCase()));
  const allColumns = [...columnSet].filter((c) => c.startsWith("ct_")).sort();

  log("INFO", `Found ${allAttrs.length} total columns (${allColumns.length} custom ct_ columns).`);
  log("INFO", "");

  // Step 3: Check each expected column
  log("INFO", "─────────────────────────────────────────────────────────");
  log("INFO", "  Pipeline Field      Expected Column         Status");
  log("INFO", "─────────────────────────────────────────────────────────");

  const found = [];
  const missing = [];

  for (const expected of EXPECTED_COLUMNS) {
    let matchedCol = null;
    for (const candidate of expected.expectedColumns) {
      if (columnSet.has(candidate)) {
        matchedCol = candidate;
        break;
      }
    }

    if (matchedCol) {
      const attr = allAttrs.find((a) => a.LogicalName.toLowerCase() === matchedCol);
      const type = attr?.AttributeTypeName?.Value || "?";
      const canCreate = attr?.IsValidForCreate ? "✅" : "🚫";
      log("INFO", `  ✅ ${expected.field.padEnd(20)} ${matchedCol.padEnd(24)} FOUND [${type}] ${canCreate}`);
      found.push({ field: expected.field, column: matchedCol, type });
    } else {
      log("INFO", `  ❌ ${expected.field.padEnd(20)} ${expected.expectedColumns[0].padEnd(24)} MISSING`);
      missing.push({ field: expected.field, triedColumns: expected.expectedColumns });
    }
  }

  log("INFO", "─────────────────────────────────────────────────────────");
  log("INFO", "");

  // Step 4: Summary
  log("INFO", `  📊 Results: ${found.length} FOUND, ${missing.length} MISSING`);
  log("INFO", "");

  if (missing.length > 0) {
    log("INFO", "  ⚠️  Missing columns need to be created in Dataverse:");
    for (const m of missing) {
      log("INFO", `      → ${m.field}: create column "${m.triedColumns[0]}" on ct_orders`);
    }
    log("INFO", "");
  }

  // Step 5: List all custom columns for reference
  log("INFO", "  📋 All custom ct_ columns on ct_orders:");
  for (const col of allColumns) {
    log("INFO", `      ${col}`);
  }
  log("INFO", "");

  log("INFO", "═══════════════════════════════════════════════════════════");
  log("INFO", "  Column check complete.");
  log("INFO", `  Log saved to: ${LOG_FILE}`);
  log("INFO", "═══════════════════════════════════════════════════════════");

  return { found, missing, allColumns };
}

module.exports = { runColumnCheck, EXPECTED_COLUMNS };

// ── Direct execution: node dataverse/column-check.js ────────────────────────
if (require.main === module) {
  runColumnCheck().catch((err) => {
    log("ERROR", `❌ Column check failed: ${err.message}`);
    process.exit(1);
  });
}
