"use strict";

/**
 * READ-ONLY Square-aligned snapshots from local JSON — never mutates Square APIs.
 */

const fs = require("fs");
const path = require("path");

const REPO_DATA = path.join(__dirname, "..", "..", "..", "data");

function readJsonSafe(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (_e) {
    return null;
  }
}

function invoiceOverview() {
  try {
    const fp = path.join(REPO_DATA, "square-sync-state.json");
    const blob = readJsonSafe(fp);
    const keys = blob && typeof blob === "object" ? Object.keys(blob).slice(0, 28) : [];
    return {
      readonly: true,
      sourcePath: fp,
      keysPreview: keys,
      lastSignals: blob && (blob.updatedAt || blob.lastSyncAt) ? blob.updatedAt || blob.lastSyncAt : null,
    };
  } catch (e) {
    return { readonly: true, error: e.message || String(e) };
  }
}

function unpaidInvoiceHint() {
  try {
    return { readonly: true, hint: invoiceOverview(), note: "heuristic_placeholder_no_schema_guarantee" };
  } catch (_e) {
    return { readonly: true, error: "unpaid_hint_failed" };
  }
}

function revenueFingerprint() {
  try {
    const ov = invoiceOverview();
    const has = !!(ov.keysPreview && ov.keysPreview.length);
    return {
      readonly: true,
      fingerprint: has ? "has_square_sync_snapshot" : "empty_or_missing_sync_file",
      keysPreview: ov.keysPreview,
    };
  } catch (_e) {
    return { readonly: true, error: "rev_fingerprint_failed" };
  }
}

function ordersSummary(limit) {
  try {
    const fp = path.join(REPO_DATA, "purchase-orders.json");
    const raw = readJsonSafe(fp);
    /** @type {unknown[]} */
    let rows = [];
    if (Array.isArray(raw)) rows = raw;
    else if (raw && typeof raw === "object" && Array.isArray(raw.records)) rows = raw.records;
    const n = Math.min(120, Math.max(1, Number(limit) || 24));
    return { readonly: true, count: rows.length, preview: rows.slice(0, n), sourcePath: fp };
  } catch (e) {
    return { readonly: true, error: e.message || String(e), preview: [] };
  }
}

/** Heuristic estimate aging from persisted service-desk intake items (read-only). */

function estimateAgingSummary() {

  try {

    const fp = path.join(REPO_DATA, "service-desk-items.json");

    const blob = readJsonSafe(fp);

    const items = blob && Array.isArray(blob.items) ? blob.items : [];

    const now = Date.now();

    let stale = 0;

    items.forEach((it) => {

      try {

          if (!it || typeof it !== "object") return;

          const ds = it.createdAt || it.created || it.updatedAt;

          if (!ds) return;

          const t = new Date(String(ds)).getTime();

          if (Number.isFinite(t) && now - t > 7 * 86400000) stale++;

        } catch (_eRow) {}

    });

    return {

      readonly: true,

      deskItemCount: items.length,

      heuristicStaleOver7d: stale,

      sourcePath: fp,

      note: "local_json_only_not_square_truth",

    };

  } catch (_e) {

    return { readonly: true, error: "estimate_aging_failed" };

  }


}

/** Lightweight reorder hint from local inventory JSON (read-only). */


function reorderSignals(threshold) {


  try {


    const fp = path.join(REPO_DATA, "inventory.json");


    const blob = readJsonSafe(fp);

    const rows = blob && Array.isArray(blob.items) ? blob.items : [];


    const th = Number(threshold);

    const cut = Number.isFinite(th) && th > 0 ? th : 12;


    /** @type {object[]} */


    const low = [];


    rows.forEach((row) => {

      try {

          if (!row || typeof row !== "object") return;

          const qty = Number(row.qtyOnHand != null ? row.qtyOnHand : row.quantity);

          if (!Number.isFinite(qty) || qty >= cut) return;

          low.push({

            sku: row.sku || row.id || "?",

            qtyOnHand: qty,

            label: row.description || row.name || "",


          });

        } catch (_er) {}

    });


    return {

      readonly: true,

      threshold: cut,

      candidateCount: low.length,

      preview: low.slice(0, 40),

      sourcePath: fp,

    };

  } catch (_e) {


    return { readonly: true, candidateCount: 0, preview: [] };

  }

}

module.exports = {
  invoiceOverview,
  unpaidInvoiceHint,
  revenueFingerprint,
  ordersSummary,

  estimateAgingSummary,

  reorderSignals,
};
