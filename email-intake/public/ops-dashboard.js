(function () {
  "use strict";

  var REPORT_ROUTE = "/api/reports/run?period=today";
  var REPORT_FALLBACK = "/summary/today";

  var checklistByOrder = {};

  function $(id) {
    return document.getElementById(id);
  }

  function logFail(ctx, err) {
    try {
      console.warn("[ops-dashboard] " + ctx, err && err.message ? err.message : err);
    } catch (_) {}
  }

  async function fetchJson(url) {
    try {
      var res = await fetch(url, { headers: { Accept: "application/json" } });
      var text = await res.text();
      var data = null;
      try {
        data = text ? JSON.parse(text) : null;
      } catch (e) {
        data = null;
      }
      return { ok: res.ok, status: res.status, data: data };
    } catch (err) {
      logFail("fetch " + url, err);
      return { ok: false, status: 0, data: null, error: String(err) };
    }
  }

  function dueDateOverdue(dueStr) {
    if (!dueStr || !String(dueStr).trim()) return false;
    var d = new Date(dueStr);
    if (!Number.isFinite(d.getTime())) return false;
    var start = new Date();
    start.setHours(0, 0, 0, 0);
    return d.getTime() < start.getTime();
  }

  function riskFor(row) {
    if (dueDateOverdue(row.dueDateRaw)) return "High";
    if (row.garmentStaleDays != null && row.garmentStaleDays >= 3) return "High";
    if (row.garmentStaleDays != null && row.garmentStaleDays >= 1) return "Medium";
    if (row.daysSinceQuote != null && row.daysSinceQuote >= 3) return "High";
    if (row.daysSinceQuote != null && row.daysSinceQuote >= 2) return "Medium";
    if (row.ageHours != null && row.ageHours > 24) return "High";
    if (row.ageHours != null && row.ageHours > 12) return "Medium";
    return "Low";
  }

  function inferProjectStage(row) {
    var qb = String(row.queueBucket || "").toLowerCase();
    if (qb === "qc") return "Printing";
    if (qb === "printing") return "Printing";
    if (qb === "ready") return "Production";
    if (row.garmentOrderStatus) {
      var g = String(row.garmentOrderStatus).toUpperCase();
      if (g === "RECEIVED" || g === "NOT_NEEDED") return "Production";
      return "Production";
    }
    var depReq = Number(row.depositRequired);
    var depPaid = Number(row.depositPaid);
    if (Number.isFinite(depReq) && depReq > 0) {
      if (!Number.isFinite(depPaid) || depPaid + 1e-6 < depReq) {
        var st = String(row.orderStatus || "").toUpperCase();
        if (st.indexOf("QUOTE") >= 0) return "Quote";
        return "Deposit";
      }
    }
    if (row.orderStatus && /AWAITING_DEPOSIT|QUOTE_SENT/i.test(String(row.orderStatus))) {
      return "Deposit";
    }
    return "Quote";
  }

  function ensureRow(map, orderId) {
    var k = String(orderId || "").trim() || "_unknown";
    if (!map[k]) {
      map[k] = {
        orderId: k,
        customer: "",
        stage: "Quote",
        depositStatus: "—",
        productionType: "—",
        dueDate: "—",
        dueDateRaw: "",
        risk: "Low",
        orderStatus: "",
        depositRequired: null,
        depositPaid: null,
        daysSinceQuote: null,
        garmentOrderStatus: "",
        queueBucket: "",
        product: "",
        quantity: null,
        notes: [],
        ageHours: null,
        taskId: null,
        garmentStaleDays: null,
        sources: [],
      };
    }
    return map[k];
  }

  function mergeDeposit(map, payload) {
    var items = (payload && payload.items) || [];
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      var r = ensureRow(map, it.orderId);
      r.sources.push("deposit");
      if (it.customerName) r.customer = it.customerName;
      r.orderStatus = it.status || r.orderStatus;
      r.depositRequired = it.depositRequired;
      r.depositPaid = it.depositPaid;
      r.daysSinceQuote = it.daysSinceQuote;
      var paid = Number(it.depositPaid);
      var req = Number(it.depositRequired);
      if (Number.isFinite(req) && req > 0) {
        r.depositStatus =
          Number.isFinite(paid) && paid + 1e-6 >= req
            ? "Paid"
            : "$" + (Number.isFinite(paid) ? paid.toFixed(0) : "?") + " / $" + req.toFixed(0);
      } else {
        r.depositStatus = it.status || "Pending";
      }
      if (it.daysSinceQuote != null) {
        r.notes.push("Days since quote: " + it.daysSinceQuote);
      }
    }
  }

  function mergeGarment(map, payload) {
    var items = (payload && payload.items) || [];
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      var r = ensureRow(map, it.orderId);
      r.sources.push("garment");
      if (it.customerName) r.customer = it.customerName;
      r.garmentOrderStatus = it.garmentOrderStatus || r.garmentOrderStatus;
      r.orderStatus = it.stage || r.orderStatus;
      r.taskId = it.taskId || r.taskId;
      if (it.title) r.productionType = String(it.title).slice(0, 48);
      if (it.dueDate) {
        try {
          var d = new Date(it.dueDate);
          if (Number.isFinite(d.getTime())) {
            r.dueDateRaw = it.dueDate;
            r.dueDate = d.toLocaleDateString();
          }
        } catch (e) {
          logFail("dueDate garment", e);
        }
      }
      if (it.daysSinceActivity != null) {
        r.garmentStaleDays = it.daysSinceActivity;
        if (it.daysSinceActivity >= 2) {
          r.notes.push("Garment idle " + it.daysSinceActivity + "d");
        }
      }
      r.notes.push("Garment: " + (it.garmentOrderStatus || "pending"));
    }
  }

  function mergeQueue(map, queueData) {
    if (!queueData || typeof queueData !== "object") return;
    var buckets = [
      { key: "ready", label: "ready" },
      { key: "printing", label: "printing" },
      { key: "qc", label: "qc" },
    ];
    for (var b = 0; b < buckets.length; b++) {
      var bk = buckets[b].key;
      var label = buckets[b].label;
      var arr = queueData[bk] || [];
      for (var i = 0; i < arr.length; i++) {
        var it = arr[i];
        var r = ensureRow(map, it.orderId || it.id);
        r.sources.push("queue:" + label);
        if (it.customerName) r.customer = it.customerName;
        r.queueBucket = label;
        if (it.printType) r.productionType = it.printType;
        if (it.product) r.product = it.product;
        if (it.quantity != null) r.quantity = it.quantity;
        if (it.dueDate) {
          r.dueDateRaw = it.dueDate;
          try {
            var d = new Date(it.dueDate);
            r.dueDate = Number.isFinite(d.getTime()) ? d.toLocaleDateString() : String(it.dueDate);
          } catch (e2) {
            logFail("dueDate queue", e2);
            r.dueDate = String(it.dueDate);
          }
        }
        if (it.blockedByGarments) {
          r.notes.push("Blocked by garments");
        }
      }
    }
  }

  function finalizeRows(map) {
    var out = [];
    for (var k in map) {
      if (!Object.prototype.hasOwnProperty.call(map, k)) continue;
      var r = map[k];
      var ah = null;
      if (r.daysSinceQuote != null) ah = Number(r.daysSinceQuote) * 24;
      if (r.garmentStaleDays != null) {
        var gh = Number(r.garmentStaleDays) * 24;
        ah = ah == null ? gh : Math.max(ah, gh);
      }
      r.ageHours = ah;
      r.stage = inferProjectStage(r);
      r.risk = riskFor(r);
      out.push(r);
    }
    out.sort(function (a, b) {
      var ra = { High: 0, Medium: 1, Low: 2 }[a.risk] != null ? { High: 0, Medium: 1, Low: 2 }[a.risk] : 3;
      var rb = { High: 0, Medium: 1, Low: 2 }[b.risk] != null ? { High: 0, Medium: 1, Low: 2 }[b.risk] : 3;
      if (ra !== rb) return ra - rb;
      return String(a.customer || "").localeCompare(String(b.customer || ""));
    });
    return out;
  }

  function buildTableRows(rows, U) {
    if (!rows.length) return [U.emptyTableRow(7, "No combined rows — endpoints may be empty or unavailable")];
    var html = [];
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      var riskKind = r.risk === "High" ? "warn" : r.risk === "Medium" ? "muted" : "ok";
      var trClass = "";
      if (r.risk === "High") trClass = "ops-row-risk-high";
      else if (r.risk === "Medium") trClass = "ops-row-risk-medium";
      html.push(
        '<tr class="' +
          trClass +
          '" tabindex="0" data-order-id="' +
          U.escapeHtml(r.orderId) +
          '">' +
          "<td><strong>" +
          U.escapeHtml(r.orderId) +
          "</strong></td>" +
          "<td>" +
          U.escapeHtml(r.customer || "—") +
          "</td>" +
          "<td>" +
          U.pill(r.stage, "muted") +
          "</td>" +
          "<td>" +
          U.escapeHtml(r.depositStatus) +
          "</td>" +
          "<td>" +
          U.escapeHtml(r.productionType) +
          "</td>" +
          "<td>" +
          U.escapeHtml(r.dueDate) +
          "</td>" +
          "<td>" +
          U.pill(r.risk, riskKind) +
          "</td>" +
          "</tr>"
      );
    }
    return html;
  }

  var rowDataById = {};

  function openDrawer(orderId) {
    var U = window.OpsUI;
    var r = rowDataById[orderId];
    var drawer = $("detail-drawer");
    var backdrop = $("drawer-backdrop");
    var body = $("drawer-body");
    if (!drawer || !body || !U) return;
    if (!r) {
      body.innerHTML = "<p class=\"muted\">No row data.</p>";
    } else {
      var oid = String(r.orderId);
      if (!checklistByOrder[oid]) {
        checklistByOrder[oid] = [
          { label: "Customer approved quote", done: false },
          { label: "Deposit received", done: false },
          { label: "Garments ordered / received", done: false },
          { label: "Ready for production handoff", done: false },
        ];
      }
      var list = checklistByOrder[oid];
      var checkHtml = list
        .map(function (c, idx) {
          return (
            "<li><label><input type=\"checkbox\" data-ci=\"" +
            idx +
            "\" " +
            (c.done ? "checked" : "") +
            " /> " +
            U.escapeHtml(c.label) +
            "</label></li>"
          );
        })
        .join("");
      var notes = (r.notes && r.notes.length ? r.notes : ["No extra notes from APIs"]).map(function (n) {
        return "<li>" + U.escapeHtml(n) + "</li>";
      });
      body.innerHTML =
        "<div class=\"ops-drawer-section\"><h3>Order</h3><p><strong>" +
        U.escapeHtml(r.orderId) +
        "</strong></p>" +
        U.stageStrip(r.stage) +
        "</div>" +
        "<div class=\"ops-drawer-section\"><h3>Customer</h3><p>" +
        U.escapeHtml(r.customer || "—") +
        "</p></div>" +
        "<div class=\"ops-drawer-section\"><h3>Summary</h3><p class=\"muted\" style=\"font-size:0.88rem;line-height:1.45;\">" +
        U.escapeHtml(
          [r.product && "Product: " + r.product, r.quantity != null && "Qty: " + r.quantity, r.orderStatus && "Order status: " + r.orderStatus]
            .filter(Boolean)
            .join(" · ") || "Limited detail from merged endpoints."
        ) +
        "</p></div>" +
        "<div class=\"ops-drawer-section\"><h3>Status</h3>" +
        U.pill(r.stage, "muted") +
        " " +
        U.pill(r.depositStatus, "muted") +
        " " +
        U.pill(r.queueBucket || "—", "muted") +
        "</div>" +
        "<div class=\"ops-drawer-section\"><h3>Notes</h3><ul class=\"list compact\">" +
        notes.join("") +
        "</ul></div>" +
        "<div class=\"ops-drawer-section\"><h3>Project checklist (UI only)</h3><ul class=\"ops-checklist\" data-order-check=\"" +
        U.escapeHtml(oid) +
        "\">" +
        checkHtml +
        "</ul></div>" +
        "<div class=\"ops-drawer-section\"><h3>Quick actions</h3>" +
        "<p style=\"display:flex;flex-wrap:wrap;gap:0.5rem;\">" +
        '<button type="button" class="ops-btn" disabled title="Placeholder">Open in POS</button>' +
        '<button type="button" class="ops-btn" disabled title="Placeholder">Send message</button>' +
        '<button type="button" class="ops-btn" disabled title="Placeholder">Create invoice</button>' +
        "</p></div>";
    }
    drawer.classList.add("is-open");
    if (backdrop) {
      backdrop.classList.add("is-open");
      backdrop.classList.remove("hidden");
    }
  }

  function closeDrawer() {
    var drawer = $("detail-drawer");
    var backdrop = $("drawer-backdrop");
    if (drawer) drawer.classList.remove("is-open");
    if (backdrop) {
      backdrop.classList.remove("is-open");
      backdrop.classList.add("hidden");
    }
  }

  function onChecklistChange(ev) {
    var t = ev.target;
    if (!t || t.tagName !== "INPUT" || t.type !== "checkbox") return;
    var ul = t.closest && t.closest("ul[data-order-check]");
    if (!ul) return;
    var oid = ul.getAttribute("data-order-check");
    var idx = Number(t.getAttribute("data-ci"));
    if (!checklistByOrder[oid] || !Number.isFinite(idx)) return;
    checklistByOrder[oid][idx].done = !!t.checked;
  }

  async function loadAll() {
    var U = window.OpsUI;
    if (!U) {
      logFail("OpsUI missing", new Error("components/ops-ui.js not loaded"));
      return;
    }

    var statusDot = $("status-dot");
    var statusText = $("status-text");
    if (statusText) statusText.textContent = "Refreshing...";
    if (statusDot) statusDot.className = "status-dot";

    var prod = { ok: false, data: {} };
    var garment = { ok: false, data: {} };
    var deposit = { ok: false, data: {} };
    var report = { ok: false, data: null };

    try {
      prod = await fetchJson("/api/production/queue");
    } catch (e) {
      logFail("production queue", e);
    }
    try {
      garment = await fetchJson("/api/operator/garment-orders");
    } catch (e) {
      logFail("garment orders", e);
    }
    try {
      deposit = await fetchJson("/api/operator/deposit-followups");
    } catch (e) {
      logFail("deposit followups", e);
    }
    try {
      report = await fetchJson(REPORT_ROUTE);
      if (!report.ok) {
        report = await fetchJson(REPORT_FALLBACK);
      }
    } catch (e) {
      logFail("reports", e);
    }

    var rev = "—";
    var ordToday = "—";
    try {
      var rr = report && report.data;
      if (rr && rr.result) {
        rev = "$" + Number(rr.result.revenueToday || 0).toFixed(2);
        ordToday = String(rr.result.ordersCreatedToday != null ? rr.result.ordersCreatedToday : "—");
      } else if (rr && rr.data) {
        rev = JSON.stringify(rr.data).slice(0, 40) + "…";
      }
    } catch (e) {
      logFail("parse report", e);
    }

    var depCount = "—";
    try {
      if (deposit && deposit.data && deposit.data.count != null) depCount = String(deposit.data.count);
      else if (deposit && deposit.data && deposit.data.items) depCount = String(deposit.data.items.length);
    } catch (e) {
      logFail("dep count", e);
    }

    var garmentCount = "—";
    try {
      if (garment && garment.data && garment.data.count != null) garmentCount = String(garment.data.count);
      else if (garment && garment.data && garment.data.items) garmentCount = String(garment.data.items.length);
    } catch (e) {
      logFail("garment count", e);
    }

    var readyCount = "—";
    try {
      var qd = prod && prod.data;
      if (qd && qd.ready) readyCount = String(qd.ready.length);
    } catch (e) {
      logFail("ready count", e);
    }

    var map = {};
    try {
      mergeDeposit(map, deposit.data || {});
      mergeGarment(map, garment.data || {});
      mergeQueue(map, prod.data || {});
    } catch (e) {
      logFail("merge", e);
    }

    var merged = finalizeRows(map);
    rowDataById = {};
    for (var i = 0; i < merged.length; i++) {
      rowDataById[merged[i].orderId] = merged[i];
    }

    var overdue = 0;
    for (var j = 0; j < merged.length; j++) {
      if (merged[j].risk === "High") overdue++;
    }

    var kpi = $("kpi-row");
    if (kpi) {
      kpi.innerHTML =
        '<div class="ops-grid cols-5">' +
        U.kpiCard("Sales today", rev, "Orders today: " + ordToday) +
        U.kpiCard("Deposits needed", depCount, "Awaiting deposit") +
        U.kpiCard("Jobs waiting", garmentCount, "Garment pipeline") +
        U.kpiCard("Jobs ready", readyCount, "Production · ready bucket") +
        U.kpiCard("Overdue / at risk", String(overdue), "High risk in merged table") +
        "</div>" +
        '<p class="muted" style="margin:0.75rem 0 0;font-size:0.82rem;">Merged rows: ' +
        U.escapeHtml(String(merged.length)) +
        " · Data: " +
        U.escapeHtml(prod.ok && garment.ok && deposit.ok ? "all endpoints reachable" : "partial — see footer") +
        "</p>";
    }

    var wrap = $("orders-table-wrap");
    if (wrap) {
      var headers = [
        "Order #",
        "Customer",
        "Stage",
        "Deposit",
        "Production",
        "Due",
        "Risk",
      ];
      wrap.innerHTML =
        '<div class="ops-table-wrap">' +
        U.renderTable(headers, buildTableRows(merged, U)) +
        "</div>";
    }

    var conn = $("connection-status");
    if (conn) {
      var parts = [];
      parts.push("Production queue: " + (prod.ok ? "ok" : "fail " + prod.status));
      parts.push("Garment: " + (garment.ok ? "ok" : "fail " + garment.status));
      parts.push("Deposit: " + (deposit.ok ? "ok" : "fail " + deposit.status));
      parts.push("Report: " + (report.ok ? "ok" : "fail " + report.status));
      conn.textContent = parts.join(" · ");
    }

    var allOk = prod.ok && garment.ok && deposit.ok;
    if (statusDot) statusDot.className = "status-dot " + (allOk ? "status-ok" : "status-bad");
    if (statusText) statusText.textContent = allOk ? "Healthy" : "Partial";

    var lu = $("last-updated");
    if (lu) lu.textContent = new Date().toLocaleString();
  }

  document.addEventListener("click", function (ev) {
    var tr = ev.target && ev.target.closest && ev.target.closest("tbody tr[data-order-id]");
    if (tr) {
      var id = tr.getAttribute("data-order-id");
      if (id) openDrawer(id);
    }
    if (ev.target && ev.target.id === "drawer-close") closeDrawer();
    if (ev.target && ev.target.id === "drawer-backdrop") closeDrawer();
  });

  document.addEventListener("change", onChecklistChange);

  document.addEventListener("keydown", function (ev) {
    if (ev.key === "Escape") closeDrawer();
  });

  var refreshBtn = $("manual-refresh");
  if (refreshBtn) refreshBtn.addEventListener("click", loadAll);

  try {
    loadAll();
    setInterval(loadAll, 120000);
  } catch (e) {
    logFail("loadAll bootstrap", e);
  }
})();
