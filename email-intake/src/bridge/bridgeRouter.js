"use strict";

const operationalMemory = require("./operationalMemory.service");

function recordBridgeEvent(event) {
  try {
    return operationalMemory.recordMemoryEvent(event);
  } catch (e) {
    return { ok: false, error: e && e.message ? e.message : String(e) };
  }
}

function getBridgeTimeline({ entityType, entityId }) {
  try {
    return operationalMemory.getEntityTimeline(
      entityType !== undefined ? entityType : "",
      entityId !== undefined ? entityId : ""
    );
  } catch (e) {
    return { ok: false, error: e && e.message ? e.message : String(e), events: [] };
  }
}

function getRecentBridgeEvents({ limit }) {
  try {
    return operationalMemory.getRecentMemory(limit);
  } catch (e) {
    return { ok: false, error: e && e.message ? e.message : String(e), events: [] };
  }
}

function buildBridgeCustomerContext({ customer }) {
  try {
    return operationalMemory.buildCustomerContext(customer);
  } catch (e) {
    return {
      ok: false,
      error: e && e.message ? e.message : String(e),
      customerIdentifier: "",
      matchedEventCount: 0,
      events: [],
      summary: "ERROR",
    };
  }
}

module.exports = {
  recordBridgeEvent,
  getBridgeTimeline,
  getRecentBridgeEvents,
  buildBridgeCustomerContext,
};
