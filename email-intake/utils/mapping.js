// PHASE 3 — NEW FILE
/**
 * Smart product and print-type mapping for the Cheeky Tees intake pipeline.
 * Matches raw customer text against keyword tables using case-insensitive
 * substring matching. First match in priority order wins.
 *
 * @module utils/mapping
 */

/**
 * Print-type keyword rules in priority order (index 0 = highest).
 * @type {Array<{keywords: string[], mapsTo: string}>}
 */
const PRINT_TYPE_RULES = [
  { keywords: ["screen print", "screenprint"],                            mapsTo: "Screen Print" },
  { keywords: ["embroidery"],                                             mapsTo: "Embroidery" },
  { keywords: ["sublimation", "sublimated"],                              mapsTo: "DTF" },
  { keywords: ["dtf", "direct to film"],                                  mapsTo: "DTF" },
  { keywords: ["full color", "full-color", "dtg", "direct to garment"],   mapsTo: "DTG" },
  { keywords: ["logo only", "logo-only", "small logo"],                   mapsTo: "DTG" },
  { keywords: ["vinyl", "heat press"],                                    mapsTo: "Vinyl" },
  { keywords: ["jersey", "jerseys", "uniform", "uniforms"],               mapsTo: "Screen Print" },
];

/**
 * Product-category keyword rules in priority order (index 0 = highest).
 * @type {Array<{keywords: string[], mapsTo: string}>}
 */
const PRODUCT_CATEGORY_RULES = [
  { keywords: ["hat", "cap", "beanie"],              mapsTo: "Headwear" },
  { keywords: ["hoodie", "sweatshirt", "crewneck"],  mapsTo: "Fleece" },
  { keywords: ["polo"],                              mapsTo: "Polo" },
  { keywords: ["jersey", "uniform"],                 mapsTo: "Activewear" },
  { keywords: ["jacket", "vest"],                    mapsTo: "Outerwear" },
  { keywords: ["bag", "tote"],                       mapsTo: "Bags" },
  { keywords: ["t-shirt", "tee", "shirt"],           mapsTo: "T-Shirt" },
];

/**
 * Map raw customer text to a production / print type.
 *
 * Matching is case-insensitive and substring-based.
 * If multiple keywords match, the FIRST match by priority order wins.
 *
 * @param {string} rawText - Raw text from the customer (email body, extracted field, etc.)
 * @returns {string} Resolved print type: "Screen Print" | "Embroidery" | "DTF" | "DTG" | "Vinyl"
 */
function mapPrintType(rawText) {
  if (!rawText || typeof rawText !== "string") {
    console.warn("⚠️ No print type matched — defaulted to DTG");
    return "DTG";
  }

  const lower = rawText.toLowerCase();

  for (const rule of PRINT_TYPE_RULES) {
    for (const keyword of rule.keywords) {
      if (lower.includes(keyword)) {
        return rule.mapsTo;
      }
    }
  }

  console.warn("⚠️ No print type matched — defaulted to DTG");
  return "DTG";
}

/**
 * Map raw customer text to a product category.
 *
 * Matching is case-insensitive and substring-based.
 * If multiple keywords match, the FIRST match by priority order wins.
 *
 * @param {string} rawText - Raw text from the customer.
 * @returns {string} Resolved category: "Headwear" | "Fleece" | "Polo" | "Activewear" | "Outerwear" | "Bags" | "T-Shirt"
 */
function mapProductCategory(rawText) {
  if (!rawText || typeof rawText !== "string") {
    console.warn("⚠️ No product category matched — defaulted to T-Shirt");
    return "T-Shirt";
  }

  const lower = rawText.toLowerCase();

  for (const rule of PRODUCT_CATEGORY_RULES) {
    for (const keyword of rule.keywords) {
      if (lower.includes(keyword)) {
        return rule.mapsTo;
      }
    }
  }

  console.warn("⚠️ No product category matched — defaulted to T-Shirt");
  return "T-Shirt";
}

// PHASE 10 — FIXES FROM SCREENSHOT (production type choice values)
/**
 * Production type Choice column value map.
 * Maps resolved print-type strings to Dataverse Choice integers for ct_productiontype.
 * @type {Array<{keywords: string[], value: number}>}
 */
const PRODUCTION_TYPE_CHOICE_RULES = [
  { keywords: ["dtg", "full color", "full-color", "logo only", "logo-only", "small logo", "direct to garment"], value: 100000000 },
  { keywords: ["dtf", "sublimation", "sublimated", "direct to film"],                                          value: 100000001 },
  { keywords: ["screen print", "screenprint", "silk screen", "jersey", "jerseys", "uniform", "uniforms"],      value: 100000002 },
  { keywords: ["embroidery"],                                                                                    value: 100000003 },
  { keywords: ["vinyl", "heat press"],                                                                           value: 100000004 },
];

/**
 * Convert a print-type string to the correct Dataverse Choice integer
 * for the ct_productiontype column.
 *
 * @param {string} printTypeString - Resolved print type (e.g. "Screen Print", "DTG").
 * @returns {number} Integer value for the Dataverse Choice column.
 */
function getProductionTypeChoiceValue(printTypeString) {
  if (!printTypeString || typeof printTypeString !== "string") {
    console.warn("⚠️ No exact match, defaulted to DTG (100000000)");
    return 100000000;
  }

  const lower = printTypeString.toLowerCase();

  for (const rule of PRODUCTION_TYPE_CHOICE_RULES) {
    for (const keyword of rule.keywords) {
      if (lower.includes(keyword)) {
        return rule.value;
      }
    }
  }

  console.warn("⚠️ No exact match, defaulted to DTG (100000000)");
  return 100000000;
}

module.exports = { mapPrintType, mapProductCategory, getProductionTypeChoiceValue };
