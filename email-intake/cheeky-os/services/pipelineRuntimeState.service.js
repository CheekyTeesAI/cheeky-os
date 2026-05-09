"use strict";

/**
 * In-process snapshot of the last voice/pipeline order write (Session 3 system status).
 * Survives for process lifetime only.
 */

let lastProcessed = null;

/**
 * @param {string} orderId
 * @param {object} [meta]
 */
function recordLastProcessedOrder(orderId, meta = {}) {
  if (!orderId) return;
  lastProcessed = {
    orderId: String(orderId),
    at: new Date().toISOString(),
    ...meta,
  };
}

function getLastProcessedOrder() {
  return lastProcessed ? { ...lastProcessed } : null;
}

module.exports = {
  recordLastProcessedOrder,
  getLastProcessedOrder,
};
