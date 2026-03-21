/**
 * CHANGE LOG
 * v2.3 — Phase 11: final fixes from screenshots (field inject, labor entity, date, banner)
 * v2.2 — Phase 10 fixes: email/phone/sizes mapping, choice integers, labor entity, date parsing
 * v2.1 — dotenv support + dual auth mode (TOKEN / client-credentials)
 * v2.0 — Phase 1–8 upgrades applied by Copilot
 * v1.0 — Original intake pipeline
 */

// ── Load .env before anything reads process.env ─────────────────────────────
require("dotenv").config();

// ── Imports (Node built-ins + dotenv) ───────────────────────────────────────
// PHASE 1 — CHANGED: added readline for interactive input
const readline = require("readline");
const logger = require("./utils/logger");                       // PHASE 5 — CHANGED
const { mapPrintType, mapProductCategory, getProductionTypeChoiceValue } = require("./utils/mapping"); // PHASE 3 + PHASE 10 — CHANGED

// PHASE 10 (Cheeky OS) — Square integration (lazy-loaded, fire-and-forget)
let _square = null;
/**
 * Lazy-load the Square client module. Returns null if not available.
 * @returns {Object|null} The square-client module exports, or null.
 */
function getSquare() {
  if (_square === undefined) return null;
  if (!_square) {
    try {
      _square = require("./integrations/square-client");
    } catch {
      _square = undefined; // Mark as unavailable so we don't retry
      return null;
    }
  }
  return _square;
}

/**
 * Fire-and-forget Square integration: create/find customer + create invoice.
 * Never blocks or throws — all errors are logged and swallowed.
 * @param {Object} orderData - Mapped order data with customerName, email, phone, product, etc.
 */
function fireSquareIntegration(orderData) {
  const sq = getSquare();
  if (!sq || !sq.isConfigured()) {
    logger.info("Square integration skipped (not configured)");
    return;
  }
  logger.info("Square integration: starting fire-and-forget");
  // Customer lookup/creation — non-blocking
  sq.getOrCreateCustomer(
    orderData.email || "",
    orderData.customerName || "",
    orderData.phone || ""
  )
    .then((custResult) => {
      if (custResult.success) {
        logger.info(`Square customer: ${custResult.customerId} (new: ${custResult.isNew})`);
      } else {
        logger.warn(`Square customer failed: ${custResult.error}`);
      }
    })
    .catch((err) => logger.warn(`Square customer error: ${err.message}`));

  // Invoice creation — non-blocking
  sq.createInvoice(orderData)
    .then((invResult) => {
      if (invResult.success) {
        logger.info(`Square invoice: ${invResult.invoiceId} (published: ${invResult.published || false})`);
      } else {
        logger.warn(`Square invoice failed: ${invResult.error}`);
      }
    })
    .catch((err) => logger.warn(`Square invoice error: ${err.message}`));
}

// ── Config (all native fetch — Node 18+, no external HTTP deps) ─────────────
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const DATAVERSE_URL = process.env.DATAVERSE_URL || "https://org143bbb56.crm.dynamics.com";
const DATAVERSE_TENANT_ID = process.env.DATAVERSE_TENANT_ID || "9dd4d2a7-723e-48ba-a491-834433aa2509";
const DATAVERSE_CLIENT_ID = process.env.DATAVERSE_CLIENT_ID || "51f81489-12ee-4a9e-aaae-a2591f45987d";
const DATAVERSE_CLIENT_SECRET = process.env.DATAVERSE_CLIENT_SECRET || "";

// ── Prompt ───────────────────────────────────────────────────────────────────
// PHASE 2 — CHANGED: expanded extraction fields (email, phone, sizes)
const systemPrompt = `You are a data-extraction assistant for a print/apparel shop.
Given a raw customer email or order text, extract the following fields and return ONLY valid JSON
(no markdown, no explanation):

{
  "customerName": "",
  "email": "",
  "phone": "",
  "product": "",
  "quantity": "",
  "sizes": "",
  "printType": "",
  "notes": "",
  "deadline": ""
}

Rules:
- If a field is not found, use an empty string.
- "quantity" should be a string (e.g. "120").
- "sizes" should list all mentioned sizes (e.g. "60 Medium, 60 Large").
  If sizes include quantities, return a JSON array string like: [{"size":"M","qty":10},{"size":"L","qty":10}]
- "email" should be the customer's email address if present, otherwise "".
- "phone" should be the customer's phone number if present, otherwise "".
- Keep values concise.`;

// ── Choice / OptionSet Alias Maps ───────────────────────────────────────────
const OPTION_MAPS = {
  ct_productiontype: {
    "full sublimation":   100000001,
    "sublimation":        100000001,
    "silk screen":        100000001,
    "digital":            100000000,
    "direct to garment":  100000000,
    "direct to film":     100000002,
  },
};

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Normalize for fuzzy comparison: lowercase, strip spaces / underscores / hyphens. */
function norm(s) {
  return (s || "").toLowerCase().replace(/[\s_\-]/g, "");
}

// PHASE 10 — FIXES: date parsing now injects current year for yearless dates like "March 25"
/** Try to parse a human-readable date string into OData yyyy-MM-dd format. */
function toODataDate(value) {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  // If no year is present (e.g. "March 25", "3/25"), append current year before parsing
  const currentYear = new Date().getFullYear();
  const hasYear = /\b(19|20)\d{2}\b/.test(value);
  const toParse = hasYear ? value : `${value} ${currentYear}`;
  const d = new Date(toParse);
  if (isNaN(d.getTime())) return null;
  // Guard: if parsed year is far in the past, it was a yearless date that parsed wrong
  if (!hasYear && d.getFullYear() < currentYear - 1) {
    d.setFullYear(currentYear);
  }
  return d.toISOString().slice(0, 10);
}

// PHASE 2 — CHANGED: sizes normalisation helper
/**
 * Normalize extracted sizes into the correct storage format.
 * @param {string} rawSizes - Raw sizes value from OpenAI extraction.
 * @returns {string} Normalised sizes string, or "" if empty.
 */
function normalizeSizes(rawSizes) {
  if (!rawSizes || typeof rawSizes !== "string" || rawSizes.trim() === "") {
    return "";
  }
  const trimmed = rawSizes.trim();
  if (trimmed.startsWith("[")) {
    try {
      const arr = JSON.parse(trimmed);
      if (Array.isArray(arr) && arr.length > 0 && arr[0].size) {
        return JSON.stringify(arr);
      }
    } catch { /* fall through */ }
  }
  const qtyPatternParen = /([A-Za-z]+)\s*\((\d+)\)/g;
  const qtyPatternSpace = /(\d+)\s+([A-Za-z]+)/g;
  const parenMatches = [...trimmed.matchAll(qtyPatternParen)];
  if (parenMatches.length > 0) {
    const result = parenMatches.map((m) => ({ size: m[1].toUpperCase(), qty: parseInt(m[2]) }));
    return JSON.stringify(result);
  }
  const spaceMatches = [...trimmed.matchAll(qtyPatternSpace)];
  if (spaceMatches.length > 0) {
    const result = spaceMatches.map((m) => ({ size: m[2].toUpperCase(), qty: parseInt(m[1]) }));
    return JSON.stringify(result);
  }
  if (trimmed.includes(",")) {
    return trimmed.split(",").map((s) => s.trim()).filter(Boolean).join(", ");
  }
  return trimmed;
}

// PHASE 4 — CHANGED: retry helper for transient errors
/**
 * Retry wrapper for async functions with escalating delay.
 * @param {Function} fn    - Async function to execute.
 * @param {string}   label - Human-readable label for log messages.
 * @returns {Promise<*>} The resolved value from fn.
 * @throws {Error} If all 3 attempts fail or a permanent error is encountered.
 */
async function withRetry(fn, label) {
  const MAX_ATTEMPTS = 3;
  const DELAYS = [1000, 2000];
  let lastError = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const status = err.status || err.statusCode || 0;
      const isPermanent =
        status === 400 || status === 401 || status === 403 || err.name === "SyntaxError";
      if (isPermanent) {
        logger.error(`${label} failed (attempt ${attempt}/${MAX_ATTEMPTS}): ${err.message} [permanent]`);
        throw err;
      }
      logger.error(`${label} failed (attempt ${attempt}/${MAX_ATTEMPTS}): ${err.message}`);
      if (attempt < MAX_ATTEMPTS) {
        const delay = DELAYS[attempt - 1];
        logger.warn(`Retrying ${label} in ${delay}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }
  throw lastError;
}

// ── PHASE 1 — CHANGED: Interactive input ────────────────────────────────────
/**
 * Prompt the user for order text via stdin, or accept JSON test mode.
 * @returns {Promise<{rawText: string, jsonMode: boolean, parsedJson: Object|null}>}
 */
async function promptForOrderText() {
  const args = process.argv.slice(2);
  const jsonFlagIndex = args.indexOf("--json");
  if (jsonFlagIndex !== -1) {
    const jsonArg = args[jsonFlagIndex + 1];
    if (jsonArg) {
      console.log("⚡ JSON test mode — bypassing OpenAI");
      try {
        const parsed = JSON.parse(jsonArg);
        return { rawText: "", jsonMode: true, parsedJson: parsed };
      } catch (err) {
        const parseErr = new Error(`Invalid JSON argument: ${err.message}`);
        parseErr.name = "SyntaxError";
        throw parseErr;
      }
    }
  }
  return new Promise((resolve, reject) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: process.stdin.isTTY || false,
    });
    const lines = [];
    let consecutiveEmpty = 0;
    let firstLine = true;
    let isJsonMode = jsonFlagIndex !== -1;
    if (!isJsonMode) {
      console.log("Paste customer order below. Press Enter twice when done:");
    } else {
      console.log("⚡ JSON test mode — paste JSON below. Press Enter twice when done:");
    }
    rl.on("line", (line) => {
      if (firstLine && line.trim() === "JSON") {
        isJsonMode = true;
        console.log("⚡ JSON test mode — bypassing OpenAI");
        firstLine = false;
        return;
      }
      firstLine = false;
      if (line.trim() === "") {
        consecutiveEmpty++;
      } else {
        consecutiveEmpty = 0;
      }
      lines.push(line);
      if (consecutiveEmpty >= 2) {
        rl.close();
      }
    });
    rl.on("close", () => {
      let text = lines.join("\n");
      text = text.trim();
      text = text.replace(/(\r?\n){3,}/g, "\n\n");
      if (isJsonMode) {
        console.log("⚡ JSON test mode — bypassing OpenAI");
        try {
          const parsed = JSON.parse(text);
          resolve({ rawText: "", jsonMode: true, parsedJson: parsed });
        } catch (err) {
          const parseErr = new Error(`Invalid JSON input: ${err.message}`);
          parseErr.name = "SyntaxError";
          reject(parseErr);
        }
      } else {
        resolve({ rawText: text, jsonMode: false, parsedJson: null });
      }
    });
    rl.on("error", (err) => {
      reject(err);
    });
  });
}

// ── OpenAI Extraction ────────────────────────────────────────────────────────
// PHASE 4 — CHANGED: wrapped with retry logic
// PHASE 6 — CHANGED: refactored into named async function with JSDoc
/**
 * Send raw order text to OpenAI for structured field extraction.
 * @param {string} rawText - Raw customer order text.
 * @returns {Promise<Object>} Parsed JSON object with extracted order fields.
 * @throws {Error} On permanent API failure or JSON parse error.
 */
async function extractOrderDetails(rawText) {
  logger.info("Starting: OpenAI extraction");
  if (!OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY environment variable is not set");
  }
  const result = await withRetry(async () => {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4.1",
        temperature: 0,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: rawText },
        ],
      }),
    });
    if (!res.ok) {
      const errText = await res.text();
      const err = new Error(`OpenAI API error (${res.status}): ${errText}`);
      err.status = res.status;
      throw err;
    }
    const data = await res.json();
    const raw = data.choices[0].message.content.trim();
    try {
      return JSON.parse(raw);
    } catch (parseErr) {
      const err = new Error(`Failed to parse OpenAI response as JSON: ${raw}`);
      err.name = "SyntaxError";
      throw err;
    }
  }, "OpenAI");
  logger.info("Complete: OpenAI extraction");
  return result;
}

// ── Dataverse Auth ───────────────────────────────────────────────────────────
// PHASE 4 — CHANGED: throws instead of process.exit
/**
 * Validate that all required Dataverse environment variables are set.
 * @throws {Error} If any required config value is missing.
 */
function validateDataverseConfig() {
  // DATAVERSE_URL is always required regardless of auth mode
  if (!DATAVERSE_URL) {
    throw new Error(
      "Missing DATAVERSE_URL. Set it in .env or as an environment variable."
    );
  }

  // Auth Mode A: pre-obtained bearer token — no other credentials needed
  if (process.env.DATAVERSE_TOKEN) {
    return; // valid
  }

  // Auth Mode B: client-credentials — need all three
  const missing = [];
  if (!DATAVERSE_TENANT_ID) missing.push("DATAVERSE_TENANT_ID");
  if (!DATAVERSE_CLIENT_ID) missing.push("DATAVERSE_CLIENT_ID");
  if (!DATAVERSE_CLIENT_SECRET) missing.push("DATAVERSE_CLIENT_SECRET");

  if (missing.length > 0) {
    throw new Error(
      `No DATAVERSE_TOKEN found and client-credentials are incomplete. ` +
      `Missing: ${missing.join(", ")}. ` +
      `Set these in your .env file or as environment variables.\n` +
      `  Option A: DATAVERSE_TOKEN=<bearer-token>\n` +
      `  Option B: DATAVERSE_CLIENT_ID + DATAVERSE_TENANT_ID + DATAVERSE_CLIENT_SECRET`
    );
  }
}

/**
 * Obtain a Dataverse access token via Azure AD client-credentials or env var.
 * @returns {Promise<string>} Bearer access token.
 * @throws {Error} On authentication failure.
 */
async function getDataverseAccessToken() {
  if (process.env.DATAVERSE_TOKEN) {
    logger.info("Using pre-supplied DATAVERSE_TOKEN");
    return process.env.DATAVERSE_TOKEN;
  }
  logger.info("Starting: Dataverse token acquisition");
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
  logger.info("Complete: Dataverse token acquisition");
  return data.access_token;
}

// ── Dataverse Column Discovery ───────────────────────────────────────────────
/**
 * Query Dataverse metadata to discover all creatable columns and picklist options.
 * @param {string} accessToken - Valid Dataverse bearer token.
 * @returns {Promise<{attrs: Array, discoveredOptions: Object}>}
 * @throws {Error} On metadata request failure.
 */
async function discoverColumns(accessToken) {
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    "OData-MaxVersion": "4.0",
    "OData-Version": "4.0",
    Accept: "application/json",
  };
  const attrsUrl =
    `${DATAVERSE_URL}/api/data/v9.2/EntityDefinitions(LogicalName='ct_orders')/Attributes` +
    `?$select=LogicalName,DisplayName,AttributeTypeName` +
    `&$filter=IsValidForCreate eq true`;
  logger.info("Starting: Column metadata discovery");
  const attrsRes = await fetch(attrsUrl, { method: "GET", headers });
  if (!attrsRes.ok) {
    const errText = await attrsRes.text();
    throw new Error(`Attribute metadata request failed (${attrsRes.status}): ${errText}`);
  }
  const attrsData = await attrsRes.json();
  const attrs = attrsData.value || [];
  console.log(`   Found ${attrs.length} creatable columns on ct_orders:\n`);
  console.log("   LogicalName                     | Type                | DisplayName");
  console.log("   " + "─".repeat(80));
  for (const a of attrs) {
    const display = a.DisplayName?.UserLocalizedLabel?.Label || "(no label)";
    const ln = a.LogicalName.padEnd(35);
    const tp = (a.AttributeTypeName?.Value || "?").padEnd(20);
    console.log(`   ${ln}| ${tp}| ${display}`);
  }
  console.log();
  const picklistUrl =
    `${DATAVERSE_URL}/api/data/v9.2/EntityDefinitions(LogicalName='ct_orders')` +
    `/Attributes/Microsoft.Dynamics.CRM.PicklistAttributeMetadata` +
    `?$select=LogicalName&$expand=OptionSet($select=Options)`;
  logger.info("Starting: Choice/OptionSet discovery");
  const plRes = await fetch(picklistUrl, { method: "GET", headers });
  const discoveredOptions = {};
  if (plRes.ok) {
    const plData = await plRes.json();
    const picklists = plData.value || [];
    console.log(`   Found ${picklists.length} Choice / OptionSet column(s):\n`);
    for (const pl of picklists) {
      const colName = pl.LogicalName;
      const options = pl.OptionSet?.Options || [];
      discoveredOptions[colName] = {};
      console.log(`   📌 ${colName}:`);
      for (const opt of options) {
        const label = opt.Label?.UserLocalizedLabel?.Label || `(value ${opt.Value})`;
        discoveredOptions[colName][label.toLowerCase().trim()] = opt.Value;
        console.log(`      ${String(opt.Value).padEnd(12)} = ${label}`);
      }
      console.log();
    }
  } else {
    logger.warn("Could not fetch picklist metadata (non-fatal). Using OPTION_MAPS only.");
  }
  logger.info("Complete: Column metadata discovery");
  return { attrs, discoveredOptions };
}

// ── Payload Builder ─────────────────────────────────────────────────────────
/**
 * Build a Dataverse-ready payload using live column metadata with 5-strategy matching.
 * @param {Object} order - Extracted order fields.
 * @param {Object} schema - Schema from discoverColumns().
 * @param {Array}  schema.attrs - Attribute metadata.
 * @param {Object} schema.discoveredOptions - Picklist maps.
 * @returns {Object} Dataverse POST body.
 */
function buildPayload(order, { attrs, discoveredOptions }) {
  const byLogical = new Map();
  for (const a of attrs) byLogical.set(a.LogicalName.toLowerCase(), a);
  const byDisplay = new Map();
  for (const a of attrs) {
    const label = a.DisplayName?.UserLocalizedLabel?.Label;
    if (label) byDisplay.set(norm(label), a);
  }
  const choiceCols = new Set(
    attrs.filter((a) => (a.AttributeTypeName?.Value || "").toLowerCase() === "picklisttype")
      .map((a) => a.LogicalName.toLowerCase())
  );
  const dateCols = new Set(
    attrs.filter((a) => (a.AttributeTypeName?.Value || "").toLowerCase() === "datetimetype")
      .map((a) => a.LogicalName.toLowerCase())
  );
  const numericTypes = new Set(["integertype", "decimaltype", "moneytype", "biginttype", "doubletype"]);
  const numericCols = new Set(
    attrs.filter((a) => numericTypes.has((a.AttributeTypeName?.Value || "").toLowerCase()))
      .map((a) => a.LogicalName.toLowerCase())
  );
  const fieldMap = [
    { extracted: "customerName", value: order.customerName,
      candidates: ["customername", "ordername", "name"],
      displayHints: ["customername", "ordername", "name"] },
    { extracted: "email", value: order.email,
      candidates: ["customeremail", "emailaddress", "contactemail", "email", "mail"],
      displayHints: ["email", "emailaddress", "customeremail", "contactemail"] },
    { extracted: "phone", value: order.phone,
      candidates: ["customerphone", "phonenumber", "telephone", "phone", "mobile", "cell", "tel"],
      displayHints: ["phone", "phonenumber", "telephone", "customerphone", "mobile"] },
    { extracted: "product", value: order.product,
      candidates: ["garmenttype", "producttype", "productname", "product", "garment", "item"],
      displayHints: ["garmenttype", "product", "garment", "producttype", "item"] },
    { extracted: "quantity", value: order.quantity,
      candidates: ["quantity", "qty", "orderquantity"],
      displayHints: ["quantity", "qty", "orderquantity"] },
    { extracted: "sizes", value: order.sizes,
      candidates: ["sizes", "sizedetails", "sizebreakdown", "sizeinfo", "size", "sizing"],
      displayHints: ["sizes", "size", "sizedetails", "sizebreakdown"] },
    { extracted: "printType", value: order.printTypeChoiceValue !== undefined ? order.printTypeChoiceValue : order.printType,
      candidates: ["productiontype", "printtype", "printmethod", "production"],
      displayHints: ["productiontype", "printtype", "printmethod", "production"] },
    { extracted: "notes", value: order.notes,
      candidates: ["notes", "ordernotes", "comments", "note", "description"],
      displayHints: ["notes", "ordernotes", "comments"] },
    { extracted: "deadline", value: order.deadline,
      candidates: ["duedate", "deadline", "deliverydate", "requiredby", "due", "deliverby"],
      displayHints: ["duedate", "deadline", "deliverydate", "requiredby"] },
  ];
  const body = {};
  const report = [];
  const unmatchedReport = [];
  for (const f of fieldMap) {
    let hit = null;
    for (const c of f.candidates) {
      if (byLogical.has(`ct_${c}`)) { hit = byLogical.get(`ct_${c}`); break; }
    }
    if (!hit) {
      for (const c of f.candidates) {
        for (const [ln, a] of byLogical) { if (ln.endsWith(c)) { hit = a; break; } }
        if (hit) break;
      }
    }
    if (!hit) {
      for (const c of f.candidates) {
        for (const [ln, a] of byLogical) { if (ln.includes(c)) { hit = a; break; } }
        if (hit) break;
      }
    }
    if (!hit) {
      for (const d of f.displayHints) { if (byDisplay.has(d)) { hit = byDisplay.get(d); break; } }
    }
    if (!hit) {
      for (const d of f.displayHints) {
        if (d.length < 4) continue;
        for (const [dn, a] of byDisplay) { if (dn.includes(d)) { hit = a; break; } }
        if (hit) break;
      }
    }
    if (!hit) {
      const suggestions = [];
      for (const c of f.candidates) {
        for (const [ln] of byLogical) {
          if (!ln.startsWith("ct_")) continue;
          const stem = c.slice(0, Math.max(4, Math.floor(c.length * 0.6)));
          if (ln.includes(stem) && !suggestions.includes(ln)) suggestions.push(ln);
        }
      }
      unmatchedReport.push({ extracted: f.extracted, value: f.value, suggestions: suggestions.slice(0, 5) });
      continue;
    }
    const colName = hit.LogicalName;
    const colLower = colName.toLowerCase();
    let finalValue = f.value;
    let conversion = null;
    let displayType = hit.AttributeTypeName?.Value || "?";
    if (choiceCols.has(colLower) && typeof finalValue === "string") {
      displayType = "Choice";
      const strLower = finalValue.toLowerCase().trim();
      let intVal = null;
      const discovered = discoveredOptions[colName] || discoveredOptions[colLower] || {};
      if (discovered[strLower] !== undefined) {
        intVal = discovered[strLower];
        conversion = `"${finalValue}" → ${intVal} (auto-discovered label)`;
      }
      if (intVal === null) {
        const manual = OPTION_MAPS[colName] || OPTION_MAPS[colLower] || {};
        if (manual[strLower] !== undefined) {
          intVal = manual[strLower];
          conversion = `"${finalValue}" → ${intVal} (alias from OPTION_MAPS)`;
        }
      }
      if (intVal !== null) { finalValue = intVal; }
      else {
        const known = Object.entries(discovered).map(([l, v]) => `${v}="${l}"`).join(", ") || "(run script to discover)";
        conversion = `⚠️ "${finalValue}" not in options [${known}]`;
      }
    } else if (dateCols.has(colLower) && typeof finalValue === "string") {
      displayType = "DateTime";
      const iso = toODataDate(finalValue);
      if (iso) { conversion = `"${finalValue}" → "${iso}"`; finalValue = iso; }
      else { conversion = `⚠️ Could not parse "${finalValue}" as date`; }
    } else if (numericCols.has(colLower)) {
      displayType = "Integer";
      const parsed = parseInt(finalValue);
      if (!isNaN(parsed)) {
        if (String(finalValue) !== String(parsed)) conversion = `"${finalValue}" → ${parsed}`;
        finalValue = parsed;
      }
    } else {
      displayType = "String";
    }
    body[colName] = finalValue;
    report.push({ extracted: f.extracted, mapped: colName, type: displayType, conversion });
  }
  // NOTE: email, phone, sizes are kept in the mapped order object for display
  // and logging, but are NOT force-injected into the Dataverse payload.
  // The 5-strategy matching above will map them if matching ct_ columns exist.
  // If they don't match, they appear as unmatched below — this is expected until
  // the corresponding columns are created in Dataverse.

  console.log("\n" + "─".repeat(60));
  console.log("  ✅ Column Mapping Summary");
  console.log("─".repeat(60));
  for (const r of report) {
    const conv = r.conversion ? `\n${" ".repeat(47)}↳ ${r.conversion}` : "";
    console.log(`   ✅ ${r.extracted.padEnd(15)} → ${r.mapped.padEnd(25)} [${r.type}]${conv}`);
  }
  for (const u of unmatchedReport) {
    const suggest = u.suggestions.length > 0
      ? `\n${" ".repeat(47)}💡 Did you mean: ${u.suggestions.join(", ")}?`
      : `\n${" ".repeat(47)}💡 No similar ct_ columns found.`;
    console.log(`   ⚠️  ${u.extracted.padEnd(15)} → NOT IN DATAVERSE (value saved for display only)`);
  }
  console.log("─".repeat(60) + "\n");

  return body;
}

// ── PHASE 6 — CHANGED: mapToDataverse function ─────────────────────────────
// PHASE 2 — CHANGED: adds email, phone, sizes with fallbacks
// PHASE 3 — CHANGED: applies smart print-type and product-category mapping
/**
 * Map extracted order fields to Dataverse-ready payload.
 * @param {Object} extracted - Raw extracted fields from OpenAI.
 * @returns {Promise<Object>} Enriched order object ready for buildPayload().
 */
async function mapToDataverse(extracted) {
  logger.info("Starting: Field mapping");
  const mapped = { ...extracted };
  const requiredFields = [
    { name: "email",        fallback: null },
    { name: "phone",        fallback: null },
    { name: "sizes",        fallback: "" },
    { name: "customerName", fallback: null },
    { name: "product",      fallback: null },
    { name: "quantity",     fallback: null },
    { name: "printType",    fallback: null },
    { name: "notes",        fallback: null },
    { name: "deadline",     fallback: null },
  ];
  for (const field of requiredFields) {
    if (mapped[field.name] === undefined || mapped[field.name] === "") {
      logger.warn(`Missing field: ${field.name} — setting to ${field.fallback === null ? "null" : '""'}`);
      mapped[field.name] = field.fallback;
    }
  }
  if (mapped.sizes !== null) {
    mapped.sizes = normalizeSizes(mapped.sizes || "");
  }
  try {
    const rawForMapping = `${mapped.product || ""} ${mapped.printType || ""} ${mapped.notes || ""}`;
    const resolvedPrintType = mapPrintType(rawForMapping);
    logger.info(`Print type resolved: "${mapped.printType}" → "${resolvedPrintType}"`);
    // PHASE 10 — FIXES: Convert print type string to Dataverse Choice integer
    const choiceValue = getProductionTypeChoiceValue(resolvedPrintType);
    logger.info(`Production type choice value: "${resolvedPrintType}" → ${choiceValue}`);
    mapped.printType = resolvedPrintType;
    mapped.printTypeChoiceValue = choiceValue;
  } catch (err) {
    logger.error(`Mapping failed: ${err.message}`);
  }
  try {
    const rawForCategory = `${mapped.product || ""} ${mapped.notes || ""}`;
    const resolvedCategory = mapProductCategory(rawForCategory);
    logger.info(`Product category resolved: "${mapped.product}" → "${resolvedCategory}"`);
    mapped.productCategory = resolvedCategory;
  } catch (err) {
    logger.error(`Mapping failed: ${err.message}`);
  }
  logger.info("Complete: Field mapping");
  return mapped;
}

// ── PHASE 4 — CHANGED: validation function ──────────────────────────────────
/**
 * Validate a mapped order payload before sending to Dataverse.
 * @param {Object} payload - Mapped order object from mapToDataverse().
 * @returns {Promise<{valid: boolean, warnings: string[]}>}
 */
async function validateOrder(payload) {
  logger.info("Starting: Order validation");
  const warnings = [];
  if (!payload.customerName) warnings.push("Customer name is missing");
  if (!payload.quantity) warnings.push("Quantity is missing");
  if (!payload.email) warnings.push("Customer email is missing");
  if (!payload.phone) warnings.push("Customer phone is missing");
  if (!payload.sizes || payload.sizes === "") warnings.push("Sizes information is missing");
  if (!payload.product) warnings.push("Product/garment type is missing");
  if (!payload.printType) warnings.push("Print type is missing");
  for (const w of warnings) { logger.warn(w); }
  const valid = !!(payload.customerName || payload.quantity);
  logger.info(`Complete: Order validation (valid=${valid}, warnings=${warnings.length})`);
  return { valid, warnings };
}

// ── Dataverse Submit ─────────────────────────────────────────────────────────
// PHASE 4 — CHANGED: added retry logic
// PHASE 6 — CHANGED: refactored, throws instead of process.exit
/**
 * Send a mapped order payload to Dataverse ct_orderses.
 * @param {Object} payload - Mapped order object from mapToDataverse().
 * @returns {Promise<string|null>} The created record ID, or null.
 * @throws {Error} On permanent failure after retries exhausted.
 */
async function sendToDataverse(payload) {
  logger.info("Starting: Dataverse submission");
  validateDataverseConfig();
  logger.info(`Using Dataverse URL: ${DATAVERSE_URL}`);
  logger.info(`Auth Mode: ${process.env.DATAVERSE_TOKEN ? "TOKEN" : "CLIENT_CREDENTIALS"}`);
  const accessToken = await getDataverseAccessToken();
  const schema = await discoverColumns(accessToken);
  const body = buildPayload(payload, schema);
  const url = `${DATAVERSE_URL}/api/data/v9.2/ct_orderses`;
  logger.logPayload("Dataverse POST payload", body);
  logger.info(`POST → ${url}`);
  const result = await withRetry(async () => {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "OData-MaxVersion": "4.0",
        "OData-Version": "4.0",
        Accept: "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const errorText = await res.text();
      const err = new Error(`Dataverse Error (${res.status} ${res.statusText}): ${errorText}`);
      err.status = res.status;
      throw err;
    }
    const entityId = res.headers.get("OData-EntityId");
    let recordId = null;
    if (entityId) {
      const match = entityId.match(/\(([^)]+)\)/);
      if (match) recordId = match[1];
    }
    if (!recordId) {
      try {
        const responseBody = await res.json();
        recordId = responseBody.ct_ordersid || responseBody.ct_orderid || null;
      } catch { /* empty response is fine */ }
    }
    return recordId;
  }, "Dataverse");
  logger.info(`Complete: Dataverse submission | Record ID: ${result || "(unknown)"}`);
  return result;
}

// ── Labor Tracking ─────────────────────────────────────────────────────────
// PHASE 10 — FIXES: changed entity from ct_tasks to ct_laborrecords
/**
 * Create a labor tracking record in ct_laborrecords linked to the given order.
 * Uses the same Dataverse auth as sendToDataverse but posts directly
 * to the ct_laborrecords entity set. Failures are logged but never halt the pipeline.
 *
 * @param {string} orderId  - The ct_orderses record GUID returned from order creation.
 * @param {string} userName - Display name for the labor entry (e.g. operator name).
 * @returns {Promise<string|null>} The created labor record ID, or null on failure.
 */
async function createLaborRecord(orderId, userName) {
  try {
    logger.info("Starting: Labor record creation");
    validateDataverseConfig();
    const accessToken = await getDataverseAccessToken();
    const now = new Date().toISOString();
    const payload = {
      ct_name: "Intake Session - " + userName,
      ct_clockin: now,
      ct_clockout: now,
      ct_laborhours: 0,
      "ct_orderid@odata.bind": `/ct_orderses(${orderId})`
    };
    const url = `${DATAVERSE_URL}/api/data/v9.2/ct_laborrecords`;
    logger.logPayload("Labor record payload", payload);
    logger.info(`POST → ${url}`);
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "OData-MaxVersion": "4.0",
        "OData-Version": "4.0",
        Accept: "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const errorText = await res.text();
      logger.error(`Labor record failed (${res.status}): ${errorText}`);
      return null;
    }
    const entityId = res.headers.get("OData-EntityId");
    let taskId = null;
    if (entityId) {
      const match = entityId.match(/\(([^)]+)\)/);
      if (match) taskId = match[1];
    }
    if (!taskId) {
      try {
        const responseBody = await res.json();
        taskId = responseBody.ct_laborrecordid || responseBody.ct_laborrecordsid || null;
      } catch { /* empty response is fine */ }
    }
    logger.info(`Complete: Labor record creation | Labor ID: ${taskId || "(unknown)"}`);
    return taskId;
  } catch (error) {
    logger.error(`Labor record failed: ${error.message}`);
    return null;
  }
}

// ── PHASE 6 — CHANGED: main orchestrator
/**
 * Main entry point. Orchestrates the full intake pipeline.
 * @returns {Promise<void>}
 */
async function main() {
  logger.info("Starting: Cheeky Tees intake pipeline v2.0");
  let extracted = null;
  try {
    const input = await promptForOrderText();
    if (input.jsonMode) {
      extracted = input.parsedJson;
      logger.logPayload("JSON test mode input", extracted);
    } else {
      if (!input.rawText) {
        logger.error("No order text received. Exiting.");
        process.exit(1);
      }
      logger.logPayload("Raw order text", { text: input.rawText });
      extracted = await extractOrderDetails(input.rawText);
    }
    logger.logPayload("Extracted order details", extracted);
    const mapped = await mapToDataverse(extracted);
    logger.logPayload("Mapped order payload", mapped);
    const validation = await validateOrder(mapped);
    if (!validation.valid) {
      logger.warn("Order validation failed — proceeding anyway (best effort)");
    }
    const recordId = await sendToDataverse(mapped);

    // PHASE 11 — FINAL FIXES FROM LATEST SCREENSHOTS: success banner + isolated labor
    logger.info(`Order created successfully | ID: ${recordId || "(none)"} | Customer: ${mapped.customerName || "(unknown)"}`);

    // Labor record creation — fully isolated, never blocks the main order
    if (recordId) {
      try {
        await createLaborRecord(recordId, mapped.customerName || "Staff");
      } catch (laborErr) {
        logger.warn(`Labor record skipped (non-blocking): ${laborErr.message}`);
      }
    } else {
      logger.warn("No order ID returned — skipping labor record");
    }

    // PHASE 10 — Square integration (fire-and-forget after Dataverse succeeds)
    fireSquareIntegration(mapped);

    // Big green banner for shop staff
    console.log("\n" + "═".repeat(60));
    console.log("  ✅✅✅ ORDER FULLY CREATED ✅✅✅");
    if (recordId) {
      console.log(`  📋 Record ID:  ${recordId}`);
    }
    console.log(`  👤 Customer:   ${mapped.customerName || "(unknown)"}`);
    console.log(`  📧 Email:      ${mapped.email || "(none)"}`);
    console.log(`  📞 Phone:      ${mapped.phone || "(none)"}`);
    console.log(`  📏 Sizes:      ${mapped.sizes || "(none)"}`);
    console.log(`  📦 Product:    ${mapped.product || "(unknown)"}`);
    console.log(`  🔢 Quantity:   ${mapped.quantity || "(unknown)"}`);
    console.log(`  🎨 Print:      ${mapped.printType || "(unknown)"}`);
    console.log("═".repeat(60) + "\n");
    logger.info("Complete: Cheeky Tees intake pipeline v2.0");
  } catch (err) {
    logger.error(`Pipeline failed: ${err.message}`);
    if (extracted) {
      console.log("\n📋 Last successfully extracted data (copy this for manual entry):");
      console.log(JSON.stringify(extracted, null, 2));
      logger.logPayload("Fallback — last extracted data", extracted);
    }
    process.exit(1);
  }
}

// ── PHASE 1 (Cheeky OS) — Email ingestion entry point ───────────────────────
/**
 * Ingest order data from a parsed email object. Called by the email-poller
 * when a new unread order email is detected. Runs the full pipeline:
 * extract → map → validate → POST to Dataverse → labor record.
 *
 * @param {Object} emailData - Parsed email with { subject, body, from } fields.
 * @param {string} emailData.subject - Email subject line.
 * @param {string} emailData.body    - Plain-text email body (HTML already stripped).
 * @param {string} emailData.from    - Sender email address.
 * @returns {Promise<{recordId: string|null, mapped: Object}>} Created record info.
 * @throws {Error} On extraction or Dataverse failure.
 */
async function ingestFromEmail(emailData) {
  logger.info(`Ingesting email from ${emailData.from}: "${emailData.subject}"`);

  if (!emailData.body || emailData.body.trim().length < 10) {
    throw new Error("Email body is empty or too short to extract order details.");
  }

  // Step 1: Extract via OpenAI
  const extracted = await extractOrderDetails(emailData.body);
  logger.logPayload("Email extraction result", extracted);

  // Step 2: Map fields
  const mapped = await mapToDataverse(extracted);

  // Step 3: Validate (warn but proceed)
  const validation = await validateOrder(mapped);
  if (!validation.valid) {
    logger.warn(`Email order validation warnings: ${validation.warnings.join(", ")}`);
  }

  // Step 4: Send to Dataverse
  const recordId = await sendToDataverse(mapped);
  logger.info(`Email order created | ID: ${recordId || "(unknown)"} | From: ${emailData.from}`);

  // Step 5: Labor record (non-blocking)
  if (recordId) {
    try {
      await createLaborRecord(recordId, emailData.from);
    } catch (laborErr) {
      logger.warn(`Labor record skipped for email order: ${laborErr.message}`);
    }
  }

  // Step 6: Square integration (fire-and-forget)
  fireSquareIntegration(mapped);

  return { recordId, mapped };
}

// ── PHASE 2 (Cheeky OS) — Webhook intake entry point ────────────────────────
/**
 * Handle an incoming webhook POST with pre-structured order JSON.
 * Bypasses OpenAI entirely — accepts a JSON body that matches the
 * extracted-order schema and runs it through mapping → Dataverse.
 *
 * Called by webhook/server.js Express route.
 *
 * @param {Object} orderJson - Pre-structured order fields (same shape as OpenAI output).
 * @returns {Promise<{recordId: string|null, mapped: Object}>} Created record info.
 * @throws {Error} On mapping or Dataverse failure.
 */
async function handleWebhook(orderJson) {
  logger.info("Webhook intake: processing pre-structured order JSON");
  logger.logPayload("Webhook input", orderJson);

  // Step 1: Map fields (no OpenAI needed)
  const mapped = await mapToDataverse(orderJson);

  // Step 2: Validate
  const validation = await validateOrder(mapped);
  if (!validation.valid) {
    logger.warn(`Webhook order validation warnings: ${validation.warnings.join(", ")}`);
  }

  // Step 3: Send to Dataverse
  const recordId = await sendToDataverse(mapped);
  logger.info(`Webhook order created | ID: ${recordId || "(unknown)"}`);

  // Step 4: Labor record (non-blocking)
  if (recordId) {
    try {
      await createLaborRecord(recordId, "Webhook");
    } catch (laborErr) {
      logger.warn(`Labor record skipped for webhook order: ${laborErr.message}`);
    }
  }

  // Step 5: Square integration (fire-and-forget)
  fireSquareIntegration(mapped);

  return { recordId, mapped };
}

// ── Module exports + entry point guard ──────────────────────────────────────
// PHASE 6 — CHANGED: exports for testability, require.main guard for CLI
module.exports = {
  promptForOrderText,
  extractOrderDetails,
  mapToDataverse,
  validateOrder,
  sendToDataverse,
  createLaborRecord,
  main,
  ingestFromEmail,
  handleWebhook,
  normalizeSizes,
  withRetry,
  buildPayload,
  discoverColumns,
  validateDataverseConfig,
  getDataverseAccessToken,
  norm,
  toODataDate,
  fireSquareIntegration,
  OPTION_MAPS,
};

if (require.main === module) {
  main();
}
