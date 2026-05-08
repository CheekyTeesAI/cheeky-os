#!/usr/bin/env node
/**
 * Emit Dataverse-ready CSV for ct_stage_definition from seed JSON (single source of truth).
 * Run: node scripts/emit-stage-seed-csv.js
 * Output: docs/cheeky-os-v1-unification/dataverse/seed_ct_stage_definition.csv
 */
"use strict";

const fs = require("fs");
const path = require("path");

const jsonPath = path.join(
  __dirname,
  "..",
  "..",
  "docs",
  "cheeky-os-v1-unification",
  "dataverse",
  "seed_ct_stage_definition.json"
);
const outCsv = path.join(
  __dirname,
  "..",
  "..",
  "docs",
  "cheeky-os-v1-unification",
  "dataverse",
  "seed_ct_stage_definition.csv"
);

function esc(v) {
  if (v == null) return "";
  const s = String(v);
  if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

const raw = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
const rows = raw.rows || [];
const header = [
  "ct_code",
  "ct_label",
  "ct_sort_order",
  "ct_kanban_column",
  "ct_color_hex",
  "ct_visible_after_gate",
  "ct_is_terminal",
];
const lines = [header.join(",")];
for (const row of rows) {
  lines.push(
    [
      esc(row.ct_code),
      esc(row.ct_label),
      esc(row.ct_sort_order),
      esc(row.ct_kanban_column),
      esc(row.ct_color_hex),
      esc(row.ct_visible_after_gate),
      esc(row.ct_is_terminal),
    ].join(",")
  );
}
fs.writeFileSync(outCsv, lines.join("\r\n") + "\r\n", "utf8");
console.log("[emit-stage-seed-csv] wrote", outCsv, "(" + rows.length + " rows)");
