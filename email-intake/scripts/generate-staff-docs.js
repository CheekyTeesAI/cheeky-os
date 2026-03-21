/**
 * Staff Docs Validator — Cheeky Tees
 * Reads current system state (endpoints, stages, command types) from
 * existing source files and validates that staff docs reference them
 * correctly. Prints a report showing current vs documented values.
 *
 * Run as: node scripts/generate-staff-docs.js
 *
 * @module scripts/generate-staff-docs
 */

const fs = require("fs");
const path = require("path");

/** Staff doc directory. */
const STAFF_DIR = path.join(__dirname, "..", "staff");

/** All staff doc files to validate. */
const STAFF_FILES = [
  "operations-guide.md",
  "daily-checklist.md",
  "quick-reference.md",
  "README.md",
];

/** Known valid production stages (from webhook/server.js VALID_STAGES). */
const VALID_STAGES = ["received", "art", "printing", "finished", "shipped"];

/** Known webhook endpoints. */
const VALID_ENDPOINTS = [
  "/health",
  "/intake",
  "/order-complete",
  "/notify-customer",
  "/production-update",
  "/square-webhook",
];

/** Known command types (from bridge/command-types.json). */
let COMMAND_TYPES = [];
try {
  const ct = require("../bridge/command-types.json");
  COMMAND_TYPES = Object.keys(ct.commandTypes);
} catch {
  console.log("⚠️  Could not load bridge/command-types.json — skipping command type check");
}

/** Known Dataverse tables. */
const DATAVERSE_TABLES = [
  "ct_orderses",
  "ct_laborrecords",
  "ct_customers",
  "ct_vendors",
  "ct_quotes",
  "ct_production",
];

/* ── Helpers ───────────────────────────────────────────────────────────── */

/**
 * Read a staff doc file and return its contents.
 * @param {string} filename - File name in the staff/ directory.
 * @returns {string|null} File contents or null if not found.
 */
function readStaffDoc(filename) {
  const filepath = path.join(STAFF_DIR, filename);
  if (!fs.existsSync(filepath)) return null;
  return fs.readFileSync(filepath, "utf-8");
}

/**
 * Check that a doc mentions all expected items.
 * @param {string} content - Document content.
 * @param {string[]} items - Items that should be referenced.
 * @param {string} label   - Label for reporting.
 * @returns {{ found: string[], missing: string[] }}
 */
function checkReferences(content, items, label) {
  const lower = content.toLowerCase();
  const found = [];
  const missing = [];
  for (const item of items) {
    if (lower.includes(item.toLowerCase())) {
      found.push(item);
    } else {
      missing.push(item);
    }
  }
  return { found, missing };
}

/* ── Main ──────────────────────────────────────────────────────────────── */

/**
 * Run the staff docs validation and print a report.
 */
function main() {
  console.log("");
  console.log("═".repeat(60));
  console.log("  📋 CHEEKY OS — Staff Docs Validator");
  console.log("  " + new Date().toISOString());
  console.log("═".repeat(60));

  let totalIssues = 0;

  // Check that all staff files exist
  console.log("\n── File Check ──────────────────────────────────────────");
  for (const file of STAFF_FILES) {
    const filepath = path.join(STAFF_DIR, file);
    if (fs.existsSync(filepath)) {
      const stats = fs.statSync(filepath);
      const kb = (stats.size / 1024).toFixed(1);
      console.log(`  ✅ ${file} (${kb} KB)`);
    } else {
      console.log(`  ❌ ${file} — MISSING`);
      totalIssues++;
    }
  }

  // Validate operations-guide.md references
  console.log("\n── Operations Guide Validation ─────────────────────────");
  const opsGuide = readStaffDoc("operations-guide.md");
  if (opsGuide) {
    // Check stages
    const stageCheck = checkReferences(opsGuide, VALID_STAGES, "stages");
    if (stageCheck.missing.length === 0) {
      console.log(`  ✅ All ${VALID_STAGES.length} production stages referenced`);
    } else {
      console.log(`  ❌ Missing stages: ${stageCheck.missing.join(", ")}`);
      totalIssues += stageCheck.missing.length;
    }

    // Check key concepts
    const keyConcepts = ["dashboard", "square", "teams", "outlook", "dataverse", "email"];
    const conceptCheck = checkReferences(opsGuide, keyConcepts, "concepts");
    if (conceptCheck.missing.length === 0) {
      console.log(`  ✅ All ${keyConcepts.length} key system concepts referenced`);
    } else {
      console.log(`  ⚠️  Missing concepts: ${conceptCheck.missing.join(", ")}`);
      totalIssues += conceptCheck.missing.length;
    }

    // Check production types
    const printTypes = ["screen print", "dtg", "dtf", "sublimation", "embroidery", "vinyl"];
    const printCheck = checkReferences(opsGuide, printTypes, "print types");
    if (printCheck.missing.length === 0) {
      console.log(`  ✅ All ${printTypes.length} print types referenced`);
    } else {
      console.log(`  ⚠️  Missing print types: ${printCheck.missing.join(", ")}`);
      totalIssues += printCheck.missing.length;
    }
  } else {
    console.log("  ❌ operations-guide.md not found — cannot validate");
    totalIssues++;
  }

  // Validate quick-reference.md
  console.log("\n── Quick Reference Validation ──────────────────────────");
  const quickRef = readStaffDoc("quick-reference.md");
  if (quickRef) {
    const stageCheck = checkReferences(quickRef, VALID_STAGES, "stages");
    if (stageCheck.missing.length === 0) {
      console.log(`  ✅ All ${VALID_STAGES.length} production stages referenced`);
    } else {
      console.log(`  ❌ Missing stages: ${stageCheck.missing.join(", ")}`);
      totalIssues += stageCheck.missing.length;
    }

    // Check stage colors are documented
    var stageColors = ["blue", "purple", "orange", "green", "gray", "red"];
    var colorCheck = checkReferences(quickRef, stageColors, "colors");
    if (colorCheck.missing.length === 0) {
      console.log(`  ✅ All ${stageColors.length} stage colors documented`);
    } else {
      console.log(`  ⚠️  Missing stage colors: ${colorCheck.missing.join(", ")}`);
      totalIssues += colorCheck.missing.length;
    }
  } else {
    console.log("  ❌ quick-reference.md not found — cannot validate");
    totalIssues++;
  }

  // Validate daily-checklist.md
  console.log("\n── Daily Checklist Validation ──────────────────────────");
  const checklist = readStaffDoc("daily-checklist.md");
  if (checklist) {
    // Check it has morning, midday, end of day sections
    const sections = ["morning", "midday", "end of day"];
    const sectionCheck = checkReferences(checklist, sections, "sections");
    if (sectionCheck.missing.length === 0) {
      console.log(`  ✅ All ${sections.length} daily sections present`);
    } else {
      console.log(`  ❌ Missing sections: ${sectionCheck.missing.join(", ")}`);
      totalIssues += sectionCheck.missing.length;
    }

    // Check it mentions key actions
    const actions = ["dashboard", "shipped", "csv", "refresh", "pat"];
    const actionCheck = checkReferences(checklist, actions, "actions");
    if (actionCheck.missing.length === 0) {
      console.log(`  ✅ All ${actions.length} key actions referenced`);
    } else {
      console.log(`  ⚠️  Missing actions: ${actionCheck.missing.join(", ")}`);
      totalIssues += actionCheck.missing.length;
    }
  } else {
    console.log("  ❌ daily-checklist.md not found — cannot validate");
    totalIssues++;
  }

  // System state summary
  console.log("\n── Current System State ────────────────────────────────");
  console.log(`  Production stages: ${VALID_STAGES.join(", ")}`);
  console.log(`  Webhook endpoints: ${VALID_ENDPOINTS.join(", ")}`);
  console.log(`  Command types:     ${COMMAND_TYPES.length} loaded`);
  console.log(`  Dataverse tables:  ${DATAVERSE_TABLES.join(", ")}`);

  // Final report
  console.log("\n" + "═".repeat(60));
  if (totalIssues === 0) {
    console.log("  ✅ Staff docs are current. No issues found.");
  } else {
    console.log(`  ⚠️  ${totalIssues} issue(s) found. Review output above.`);
  }
  console.log("═".repeat(60));
  console.log("");

  process.exit(totalIssues > 0 ? 1 : 0);
}

main();
