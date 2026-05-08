"use strict";

function tsMs(x) {
  try {
    const t = new Date(String(x || "")).getTime();
    return Number.isFinite(t) ? t : NaN;
  } catch (_e) {
    return NaN;
  }
}

/**
 * @param {object[]} events
 * @param {number=} windowHours
 */
function summarize(events, windowHours) {
  try {
    const winH = Number(windowHours);
    const windowMs = Number.isFinite(winH) && winH > 0 ? winH * 3600000 : 24 * 3600000;
    const cutoff = Date.now() - windowMs;

    /** @type {Record<string, number>} */
    const counts = {};
    let recent = 0;

    const list = Array.isArray(events) ? events : [];
    list.forEach((e) => {
      try {
        if (!e || typeof e !== "object") return;
        const k = String(e.type || e.eventType || "unknown");
        counts[k] = (counts[k] || 0) + 1;
        const tm = tsMs(e.emittedAt || e.timestamp);
        if (Number.isFinite(tm) && tm >= cutoff) recent++;
      } catch (_e) {}
    });

    /** @type {string[]} */
    const topTypes = Object.keys(counts)
      .sort((a, b) => counts[b] - counts[a])
      .slice(0, 12);

    return {
      success: true,
      totalScanned: list.length,
      recentInWindow: recent,
      windowHours: windowMs / 3600000,
      counts,
      topTypes,
    };
  } catch (_e) {
    return {
      success: false,
      totalScanned: 0,
      recentInWindow: 0,
      windowHours: 24,
      counts: {},
      topTypes: [],
    };
  }
}

/**
 * Lightweight timeline view sorted ascending.
 *
 * @param {object[]} events
 * @param {number=} limit
 */
function timeline(events, limit) {
  try {
    const n = Math.min(240, Math.max(1, Number(limit) || 80));
    const list = Array.isArray(events) ? events.slice() : [];
    list.sort((a, b) => tsMs(a && a.emittedAt) - tsMs(b && b.emittedAt));
    return list.slice(-n).map((e) => ({
      id: e && e.id,
      type: e && String(e.type || ""),
      emittedAt: e && e.emittedAt,
      taskId: e && e.taskId,
      customerId: e && e.customerId,
      orderId: e && e.orderId,
    }));
  } catch (_e) {
    return [];
  }
}

module.exports = {
  summarize,
  timeline,
};
