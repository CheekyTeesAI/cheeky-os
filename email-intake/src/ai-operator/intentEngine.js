"use strict";

/**
 * Phase 1: ChatGPT sends structured { intent, params }. NL → intent mapping arrives in a later phase.
 * This module validates shape and forwards safely.
 */

function normalizeOperatorInput(input) {
  const intent = String((input && input.intent) || "").trim();
  const params = input && typeof input.params === "object" && input.params !== null ? input.params : {};
  return { intent, params };
}

module.exports = { normalizeOperatorInput };
