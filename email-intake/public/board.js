function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function priorityBorder(p) {
  var pr = String(p || "normal").toLowerCase();
  if (pr === "high") return "4px solid #e44";
  if (pr === "low") return "4px solid #888";
  return "4px solid #48e";
}

async function loadSummary() {
  try {
    var res = await fetch("/tasks/metrics");
    var data = await res.json();
    if (!data.success) return;
    var elT = document.getElementById("sum-total");
    var elS = document.getElementById("sum-stuck");
    var elH = document.getElementById("sum-high");
    if (elT) elT.textContent = String(data.total != null ? data.total : "0");
    if (elS) elS.textContent = String(data.stuckCount != null ? data.stuckCount : "0");
    if (elH) elH.textContent = String(data.highPriorityCount != null ? data.highPriorityCount : "0");
    var bs = data.byStage || {};
    ["INTAKE", "ART", "PRINT", "QC", "COMPLETE"].forEach(function (id) {
      var c = document.getElementById("cnt-" + id);
      if (c) c.textContent = String(bs[id] != null ? bs[id] : 0);
    });
  } catch (_) {}
}

async function loadTasks() {
  var statusEl = document.getElementById("status");
  try {
    await loadSummary();
    var res = await fetch("/tasks");
    var data = await res.json();
    var tasks = data.tasks || [];

    ["INTAKE", "ART", "PRINT", "QC", "COMPLETE"].forEach(function (id) {
      var col = document.getElementById(id);
      if (!col) return;
      while (col.children.length > 1) {
        col.removeChild(col.lastChild);
      }
    });

    tasks.forEach(function (task) {
      var col = document.getElementById(task.stage);
      if (!col) return;
      var el = document.createElement("div");
      el.className = "task";
      el.style.borderLeft = priorityBorder(task.priority);

      var title = String(task.title || task.type || "Task");
      var owner = String(task.owner != null ? task.owner : "unassigned");
      var pri = String(task.priority != null ? task.priority : "normal");
      var st = String(task.status != null ? task.status : "pending");

      var routingTag = "";
      if (/^PRODUCTION/i.test(title)) {
        routingTag =
          owner === "Vendor" ?
            '<br/><span style="color:#fa4;font-size:11px;">[VENDOR]</span>'
          : owner === "Printer" ?
            '<br/><span style="color:#6cf;font-size:11px;">[IN HOUSE]</span>'
          : "";
      }

      el.innerHTML =
        "<strong>" +
        esc(title) +
        "</strong>" +
        routingTag +
        '<div class="meta">' +
        "Owner: " +
        esc(owner) +
        "<br/>Priority: " +
        esc(pri) +
        "<br/>Status: " +
        esc(st) +
        "</div>";

      el.draggable = true;
      el.dataset.id = task.id;

      el.addEventListener("dragstart", function (e) {
        e.dataTransfer.setData("id", String(task.id));
      });

      el.addEventListener("click", function (e) {
        e.stopPropagation();
        var id = String(task.id);
        var action = window.prompt(
          "Task admin (1=owner, 2=priority, 3=complete). Enter 1, 2, or 3:",
          ""
        );
        if (!action) return;
        if (action === "1") {
          var o = window.prompt("New owner name:", owner);
          if (o === null) return;
          fetch("/tasks/owner", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: id, owner: o }),
          }).then(function () {
            location.reload();
          });
        } else if (action === "2") {
          var p = window.prompt("Priority (high, normal, low):", pri);
          if (p === null) return;
          fetch("/tasks/priority", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: id, priority: p }),
          }).then(function () {
            location.reload();
          });
        } else if (action === "3") {
          fetch("/tasks/complete", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: id }),
          }).then(function () {
            location.reload();
          });
        }
      });

      col.appendChild(el);
    });

    if (statusEl) {
      statusEl.textContent =
        "Last update: " +
        new Date().toLocaleTimeString() +
        " · " +
        tasks.length +
        " task(s)";
    }
  } catch (e) {
    if (statusEl) {
      statusEl.textContent =
        "Could not load /tasks — is the API running on this host?";
    }
  }
}

var board = document.querySelector(".board");
if (board) {
  board.addEventListener("dragover", function (e) {
    var col = e.target && e.target.closest && e.target.closest(".column");
    if (col) e.preventDefault();
  });
  board.addEventListener("drop", async function (e) {
    var col = e.target && e.target.closest && e.target.closest(".column");
    if (!col) return;
    e.preventDefault();
    var id = e.dataTransfer.getData("id");
    var stage = col.id;
    await fetch("/tasks/update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: id, stage: stage }),
    });
    location.reload();
  });
}

loadTasks();
setInterval(function () {
  location.reload();
}, 5000);
