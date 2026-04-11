async function loadAll() {
  try {
    var mRes = await fetch("/tasks/metrics");
    var m = await mRes.json();
    var cashEl = document.getElementById("cash-strip");
    if (cashEl && m.success) {
      var pipe = Number(m.pipelineValue != null ? m.pipelineValue : 0);
      var openE = Number(m.openEstimates != null ? m.openEstimates : 0);
      var due = Number(m.followUpsDue != null ? m.followUpsDue : 0);
      var conv =
        m.totalEstimates > 0
          ? Math.round((100 * (m.totalEstimates - openE)) / m.totalEstimates)
          : 0;
      cashEl.innerHTML =
        "<span>💰 Pipeline: <strong>$" +
        pipe.toLocaleString() +
        "</strong></span>" +
        '<span>📨 Follow-ups Due: <strong>' +
        due +
        "</strong></span>" +
        '<span>📈 Open Estimates: <strong>' +
        openE +
        "</strong></span>" +
        '<span>📋 Total Estimates: <strong>' +
        (m.totalEstimates != null ? m.totalEstimates : 0) +
        "</strong></span>" +
        '<span>✨ Conversion potential: <strong>' +
        conv +
        "%</strong> (rough)</span>";
    }
    var grid = document.getElementById("metrics-grid");
    if (grid && m.success) {
      grid.innerHTML = "";
      function card(title, value) {
        var d = document.createElement("div");
        d.className = "card";
        d.innerHTML = "<h2>" + title + '</h2><div class="num">' + value + "</div>";
        grid.appendChild(d);
      }
      card("Total tasks", m.total);
      card("Stuck (SLA)", m.stuckCount);
      card("High priority", m.highPriorityCount);
      card("Overdue (48h+ touch)", m.overdueCount);
      var stages = m.byStage || {};
      card("INTAKE", stages.INTAKE);
      card("ART", stages.ART);
      card("PRINT", stages.PRINT);
      card("QC", stages.QC);
      card("COMPLETE", stages.COMPLETE);
      var owners = m.byOwner || {};
      var keys = Object.keys(owners);
      for (var i = 0; i < keys.length; i++) {
        card("Owner: " + keys[i], owners[keys[i]]);
      }
    }

    var oRes = await fetch("/orders/metrics");
    var om = await oRes.json();
    var og = document.getElementById("orders-metrics-grid");
    if (og && om.success) {
      og.innerHTML = "";
      function ocard(t, v) {
        var d = document.createElement("div");
        d.className = "card";
        d.innerHTML = "<h2>" + t + '</h2><div class="num">' + v + "</div>";
        og.appendChild(d);
      }
      ocard("Total Orders", om.totalOrders);
      ocard("Deposits Collected", "$" + Number(om.totalDeposits || 0).toLocaleString());
      ocard("Balance Due", "$" + Number(om.totalBalanceDue || 0).toLocaleString());
      var br = om.byRouting || {};
      ocard("Routing: in_house", br.in_house != null ? br.in_house : 0);
      ocard("Routing: vendor", br.vendor != null ? br.vendor : 0);
      ocard("Routing: undecided", br.undecided != null ? br.undecided : 0);
      var bp = om.byProductionType || {};
      ocard("DTG", bp.DTG != null ? bp.DTG : 0);
      ocard("SCREENPRINT", bp.SCREENPRINT != null ? bp.SCREENPRINT : 0);
      ocard("UNKNOWN", bp.UNKNOWN != null ? bp.UNKNOWN : 0);
    }

    var eRes = await fetch("/tasks/events?limit=10");
    var eData = await eRes.json();
    var eb = document.getElementById("events-box");
    if (eb) {
      eb.textContent = eData.success
        ? JSON.stringify(eData.events, null, 2)
        : JSON.stringify(eData, null, 2);
    }

    var iRes = await fetch("/tasks/intake?limit=10");
    var iData = await iRes.json();
    var ib = document.getElementById("intake-box");
    if (ib) {
      ib.textContent = iData.success
        ? JSON.stringify(iData.intake, null, 2)
        : JSON.stringify(iData, null, 2);
    }
  } catch (err) {
    var eb = document.getElementById("events-box");
    if (eb) eb.textContent = String(err);
  }
}

loadAll();
setInterval(loadAll, 15000);
