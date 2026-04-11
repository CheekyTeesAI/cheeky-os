"use strict";

/**
 * v1.2: no PostMetrics table — stubs for future hooks.
 */

async function collectForPost() {
  return null;
}

async function backfillDraftMetrics() {
  return [];
}

module.exports = { collectForPost, backfillDraftMetrics };
