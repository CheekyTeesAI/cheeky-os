"use strict";

/**
 * READ-ONLY inbox inspection via persisted inbound runtime JSON — no SMTP/IMAP outbound.
 */

const inbound = require("../services/inbound.store");

function searchInbox(filters) {
  try {
    const msgs = inbound.getInboundMessages();
    const q = filters && filters.query ? String(filters.query).toLowerCase() : "";
    let rows = msgs;
    if (q) {
      rows = rows.filter(
        (m) =>
          String(m.subject || "")
            .toLowerCase()
            .includes(q) || String(m.body || "").toLowerCase().includes(q)
      );
    }
    const lim = Math.min(120, Math.max(1, filters && filters.limit ? Number(filters.limit) : 30));
    rows = rows.slice(0, lim);
    return { readonly: true, count: rows.length, preview: rows };
  } catch (e) {
    return { readonly: true, error: e.message || String(e), preview: [] };
  }
}

function summarizeThreads() {
  try {
    const msgs = inbound.getInboundMessages();
    /** @type {Record<string, number>} */
    const byStatus = {};
    msgs.forEach((m) => {
      const k = String(m.status || "unknown");
      byStatus[k] = (byStatus[k] || 0) + 1;
    });
    return {
      readonly: true,
      total: msgs.length,
      byStatus,
      lastSeen: msgs.length ? msgs[msgs.length - 1].receivedAt || null : null,
    };
  } catch (_e) {
    return { readonly: true, error: "summarize_failed" };
  }
}

function lastTouch() {
  try {
    const msgs = inbound.getInboundMessages();
    if (!msgs.length) return { readonly: true, last: null };
    const last = msgs[msgs.length - 1];
    return {
      readonly: true,
      last: {
        id: last.id,
        from: last.from,
        subject: last.subject,
        receivedAt: last.receivedAt,
      },
    };
  } catch (_e) {
    return { readonly: true, last: null };
  }
}

module.exports = {
  searchInbox,
  summarizeThreads,
  lastTouch,
};
