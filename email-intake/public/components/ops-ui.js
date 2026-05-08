/**
 * Lightweight UI helpers for Cheeky OS operations dashboard (global script, no ESM).
 */
(function (global) {
  "use strict";

  var STAGES = [
    "Intake",
    "Quote",
    "Deposit",
    "Production",
    "Printing",
    "Complete",
  ];

  function escapeHtml(v) {
    return String(v ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function pill(text, kind) {
    var k = kind || "default";
    var cls = "ops-pill";
    if (k === "warn") cls += " ops-pill-warn";
    else if (k === "ok") cls += " ops-pill-ok";
    else if (k === "muted") cls += " ops-pill-muted";
    return '<span class="' + cls + '">' + escapeHtml(text) + "</span>";
  }

  function kpiCard(label, value, sub) {
    return (
      '<article class="ops-card ops-kpi">' +
      '<p class="ops-kpi-label">' +
      escapeHtml(label) +
      "</p>" +
      '<p class="ops-kpi-value">' +
      escapeHtml(value) +
      "</p>" +
      '<p class="ops-kpi-sub">' +
      escapeHtml(sub || "") +
      "</p>" +
      "</article>"
    );
  }

  function emptyTableRow(colspan, message) {
    return (
      "<tr><td colspan=\"" +
      String(colspan) +
      '" class="muted" style="padding:1rem;">' +
      escapeHtml(message || "No data") +
      "</td></tr>"
    );
  }

  function renderTable(headers, rows) {
    var h =
      "<thead><tr>" +
      headers
        .map(function (x) {
          return "<th>" + escapeHtml(x) + "</th>";
        })
        .join("") +
      "</tr></thead>";
    var b =
      "<tbody>" +
      (rows && rows.length
        ? rows.join("")
        : emptyTableRow(headers.length, "No active orders")) +
      "</tbody>";
    return '<table class="ops-table">' + h + b + "</table>";
  }

  function stageStrip(projectStage) {
    var idx = STAGES.indexOf(projectStage);
    if (idx < 0) idx = 0;
    var parts = [];
    for (var i = 0; i < STAGES.length; i++) {
      var c = "ops-stage-dot";
      if (i < idx) c += " is-done";
      else if (i === idx) c += " is-active";
      parts.push('<span class="' + c + '">' + escapeHtml(STAGES[i]) + "</span>");
    }
    return '<div class="ops-project-stages">' + parts.join("") + "</div>";
  }

  global.OpsUI = {
    STAGES: STAGES,
    escapeHtml: escapeHtml,
    pill: pill,
    kpiCard: kpiCard,
    renderTable: renderTable,
    emptyTableRow: emptyTableRow,
    stageStrip: stageStrip,
  };
})(typeof window !== "undefined" ? window : this);
