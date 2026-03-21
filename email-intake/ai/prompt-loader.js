/**
 * Prompt Loader — utility module for reading and parsing the
 * Cheeky AI system prompt from disk.
 *
 * Used by the Bridge, API layer, and any future interface that
 * needs the current system prompt or its metadata.
 *
 * @module ai/prompt-loader
 */

const fs = require("fs");
const path = require("path");

/** Path to the system prompt file. */
const PROMPT_PATH = path.join(__dirname, "cheeky-system-prompt.md");

/** Cached prompt content (loaded once). */
let _cachedPrompt = null;

/**
 * Read the full system prompt from disk. Caches on first read.
 * @returns {string} The complete system prompt as a string.
 * @throws {Error} If the prompt file is not found.
 */
function getSystemPrompt() {
  if (_cachedPrompt) return _cachedPrompt;

  if (!fs.existsSync(PROMPT_PATH)) {
    throw new Error(`System prompt not found at: ${PROMPT_PATH}`);
  }

  _cachedPrompt = fs.readFileSync(PROMPT_PATH, "utf-8");
  return _cachedPrompt;
}

/**
 * Extract the version string from the system prompt header.
 * Looks for the pattern: **Version:** v1.0 — 3/20/2026
 * @returns {string} Version string (e.g. "v1.0 — 3/20/2026") or "unknown".
 */
function getPromptVersion() {
  try {
    const prompt = getSystemPrompt();
    const match = prompt.match(/\*\*Version:\*\*\s*(.+)/);
    if (match) return match[1].trim();
    return "unknown";
  } catch {
    return "unknown";
  }
}

/**
 * Parse the command categories section from the system prompt.
 * Returns an array of category names (e.g. ["BUILD_FEATURE", "MODIFY_FEATURE", ...]).
 * @returns {string[]} Array of command type names.
 */
function getCommandCategories() {
  try {
    const prompt = getSystemPrompt();
    // Find the command categories table and extract type names from backtick-wrapped values
    const tableSection = prompt.split("## Command Categories")[1] || "";
    const endSection = tableSection.split("## ")[0] || tableSection;
    const matches = endSection.match(/`([A-Z_]+)`/g);
    if (!matches) return [];
    return [...new Set(matches.map((m) => m.replace(/`/g, "")))];
  } catch {
    return [];
  }
}

/**
 * Clear the cached prompt so the next getSystemPrompt() re-reads from disk.
 * Useful after updating the prompt file.
 */
function clearCache() {
  _cachedPrompt = null;
}

// Log version on first load
try {
  const version = getPromptVersion();
  console.log(`🤖 [PROMPT] Cheeky AI system prompt loaded: ${version}`);
} catch {
  console.log("🤖 [PROMPT] System prompt not found — load deferred.");
}

module.exports = {
  getSystemPrompt,
  getPromptVersion,
  getCommandCategories,
  clearCache,
  PROMPT_PATH,
};
