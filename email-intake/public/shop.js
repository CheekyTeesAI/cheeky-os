(function () {
  "use strict";

  const AUTO_REFRESH_MS = 30000;

  const els = {
    colReady: document.getElementById("col-ready"),
    colProd: document.getElementById("col-prod"),
    colBlocked: document.getElementById("col-blocked"),
    colDone: document.getElementById("col-done"),
    countReady: document.getElementById("count-ready"),
    countProd: document.getElementById("count-prod"),
    countBlocked: document.getElementById("count-blocked"),
    countDone: document.getElementById("count-done"),
    sReady: document.getElementById("s-ready"),
    sProd: document.getElementById("s-prod"),
    sBlocked: document.getElementById("s-blocked"),
    sDone: document.getElementById("s-done"),
    sTimer: document.getElementById("s-timer"),
    statusPill: document.getElementById("status-pill"),
    panel: document.getElementById("panel"),
    panelTitle: document.getElementById("panel-title"),
    panelSub: document.getElementById("panel-sub"),
    panelDetails: document.getElementById("panel-details"),
    panelTasks: document.getElementById("panel-tasks"),
    panelNotes: document.getElementById("panel-notes"),
    panelClose: document.getElementById("panel-close"),
    scrim: document.getElementById("panel-scrim"),
    ding: document.getElementById("ding"),
    footTime: document.getElementById("foot-time"),
    footMode: document.getElementById("foot-mode"),
    footTotal: document.getElementById("foot-total"),
  };

  // Local state
  let board = { ready: [], inProduction: [], blocked: [], completed: [] };
  let tasksByJob = {};
  let currentJobId = null;
  let knownIds = new Set();
  let checked = loadChecked(); // { jobId: Set<stepIndex> }
  let refreshTimer = null;

  function loadChecked() {
    try {
      const raw = localStorage.getItem("cheekyShopChecklist");
      const obj = raw ? JSON.parse(raw) : {};
      const out = {};
      Object.keys(obj).forEach((k) => { out[k] = new Set(Array.isArray(obj[k]) ? obj[k] : []); });
      return out;
    } catch (_e) { return {}; }
  }
  function persistChecked() {
    try {
      const plain = {};
      Object.keys(checked).forEach((k) => { plain[k] = Array.from(checked[k] || []); });
      localStorage.setItem("cheekyShopChecklist", JSON.stringify(plain));
    } catch (_e) {}
  }

  function fmtDue(iso) {
    if (!iso) return "—";
    const d = new Date(iso);
    if (!Number.isFinite(d.getTime())) return "—";
    const today = new Date();
    const t0 = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
    const j0 = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const diff = Math.round((j0 - t0) / 86400000);
    if (diff === 0) return "Today";
    if (diff === 1) return "Tomorrow";
    if (diff === -1) return "Yesterday";
    if (diff < 0) return Math.abs(diff) + "d overdue";
    return "In " + diff + "d";
  }

  function shortId(id) {
    if (!id) return "";
    const s = String(id);
    return s.length > 12 ? s.slice(-8) : s;
  }

  function priorityClass(p) {
    const n = Number(p || 0);
    if (n >= 80) return "high";
    return "";
  }

  function cardEl(c, options) {
    const opts = options || {};
    const card = document.createElement("div");
    card.className = "card due-" + (c.due || "future");
    if (opts.blocked) card.classList.add("blocked");
    if (opts.completed) card.classList.add("completed");
    if (opts.isNew) card.classList.add("new");
    card.setAttribute("data-id", c.jobId);

    const top = document.createElement("div");
    top.className = "card-top";
    const cust = document.createElement("div");
    cust.className = "card-customer";
    cust.textContent = c.customer || "Unknown";
    top.appendChild(cust);

    if (!opts.blocked && !opts.completed) {
      const pri = document.createElement("div");
      pri.className = "card-priority " + priorityClass(c.priority);
      pri.textContent = "P" + (c.priority || 0);
      top.appendChild(pri);
    }
    card.appendChild(top);

    const meta = document.createElement("div");
    meta.className = "card-meta";
    const dueChip = document.createElement("span");
    dueChip.className = "card-chip " + (c.due || "future");
    dueChip.textContent = fmtDue(c.dueDate);
    meta.appendChild(dueChip);

    const method = document.createElement("span");
    method.className = "card-chip method";
    method.textContent = c.printMethod || "UNKNOWN";
    meta.appendChild(method);

    if (c.qty) {
      const qty = document.createElement("span");
      qty.className = "card-chip qty";
      qty.textContent = c.qty + (c.color ? " · " + c.color : "") + " pcs";
      meta.appendChild(qty);
    }
    card.appendChild(meta);

    if (opts.blocked && Array.isArray(c.reasons) && c.reasons.length) {
      const rwrap = document.createElement("div");
      rwrap.className = "card-reasons";
      c.reasons.slice(0, 3).forEach((r) => {
        const chip = document.createElement("span");
        chip.className = "r";
        chip.textContent = r;
        rwrap.appendChild(chip);
      });
      card.appendChild(rwrap);
    }

    const id = document.createElement("div");
    id.className = "card-id";
    id.textContent = "#" + shortId(c.jobId);
    card.appendChild(id);

    card.addEventListener("click", () => openPanel(c.jobId));
    return card;
  }

  function renderColumn(container, items, opts) {
    container.innerHTML = "";
    if (!items.length) { container.classList.add("empty"); return; }
    container.classList.remove("empty");
    items.forEach((c) => container.appendChild(cardEl(c, opts)));
  }

  function renderCompleted(items) {
    els.colDone.innerHTML = "";
    if (!items.length) {
      const span = document.createElement("span");
      span.className = "completed-chip";
      span.style.color = "var(--ink-soft)";
      span.textContent = "Nothing completed yet";
      els.colDone.appendChild(span);
      return;
    }
    items.forEach((c) => {
      const chip = document.createElement("div");
      chip.className = "completed-chip";
      chip.textContent = (c.customer || "Unknown") + " · " + (c.printMethod || "");
      chip.title = c.jobId;
      chip.addEventListener("click", () => openPanel(c.jobId));
      els.colDone.appendChild(chip);
    });
  }

  function setStatus(mock, counts) {
    const total = (counts && (counts.ready + counts.inProduction + counts.blocked + counts.completed)) || 0;
    els.footTotal.textContent = total + " job" + (total === 1 ? "" : "s");
    els.footTime.textContent = new Date().toLocaleString();
    els.footMode.textContent = "mode: " + (mock ? "mock" : "live");
    const pill = els.statusPill;
    pill.classList.remove("ok", "warn", "bad");
    if (mock) { pill.classList.add("warn"); pill.textContent = "MOCK"; }
    else { pill.classList.add("ok"); pill.textContent = "LIVE"; }
  }

  async function fetchJson(url, opts) {
    try {
      const res = await fetch(url, opts || {});
      const text = await res.text();
      try { return JSON.parse(text); } catch (_e) { return { success: false, parseError: true }; }
    } catch (err) {
      return { success: false, networkError: true, message: (err && err.message) || "network" };
    }
  }

  function detectNewIds(cols) {
    const all = []
      .concat(cols.ready || [])
      .concat(cols.inProduction || [])
      .concat(cols.blocked || []);
    const currentIds = new Set(all.map((c) => c.jobId));
    const newOnes = new Set();
    currentIds.forEach((id) => { if (!knownIds.has(id)) newOnes.add(id); });
    return { newOnes, currentIds };
  }

  async function loadBoard(options) {
    const opts = options || {};
    const res = await fetchJson("/command", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input: "__SHOP_BOARD__", shopMode: true }),
    });
    const data = res && res.data && res.data.shop ? res.data.shop : null;
    if (!data || !data.success) {
      const p = els.statusPill;
      p.classList.remove("ok", "warn"); p.classList.add("bad"); p.textContent = "ERROR";
      return;
    }

    const cols = data.columns || {};
    const { newOnes, currentIds } = detectNewIds(cols);
    const firstLoad = knownIds.size === 0;
    knownIds = currentIds;

    board.ready = cols.ready || [];
    board.inProduction = cols.inProduction || [];
    board.blocked = cols.blocked || [];
    board.completed = cols.completed || [];
    tasksByJob = data.tasksByJob || {};

    const mark = (cards) => cards.map((c) => Object.assign({}, c, { _isNew: !firstLoad && newOnes.has(c.jobId) }));
    renderColumn(els.colReady, mark(board.ready), { isNew: false });
    // per-card new flag override
    Array.from(els.colReady.children).forEach((node) => {
      const id = node.getAttribute("data-id");
      if (!firstLoad && newOnes.has(id)) node.classList.add("new");
    });
    renderColumn(els.colProd, board.inProduction, {});
    renderColumn(els.colBlocked, board.blocked, { blocked: true });
    renderCompleted(board.completed);

    els.countReady.textContent = board.ready.length;
    els.countProd.textContent = board.inProduction.length;
    els.countBlocked.textContent = board.blocked.length;
    els.countDone.textContent = board.completed.length;
    els.sReady.textContent = board.ready.length;
    els.sProd.textContent = board.inProduction.length;
    els.sBlocked.textContent = board.blocked.length;
    els.sDone.textContent = board.completed.length;

    setStatus(Boolean(data.mock), data.counts || {});

    if (!firstLoad && newOnes.size > 0 && !opts.silent) playDing();

    if (currentJobId) refreshPanel();
  }

  function playDing() {
    try {
      if (els.ding && typeof els.ding.play === "function") {
        els.ding.currentTime = 0;
        els.ding.volume = 0.35;
        els.ding.play().catch(() => {});
      }
    } catch (_e) {}
  }

  function findCard(jobId) {
    const all = []
      .concat(board.ready, board.inProduction, board.blocked, board.completed);
    return all.find((c) => c.jobId === jobId) || null;
  }

  function openPanel(jobId) {
    const card = findCard(jobId);
    if (!card) return;
    currentJobId = jobId;
    els.panel.classList.remove("hidden");
    els.scrim.classList.remove("hidden");
    renderPanel(card);
  }

  function closePanel() {
    els.panel.classList.add("hidden");
    els.scrim.classList.add("hidden");
    currentJobId = null;
  }

  function refreshPanel() {
    if (!currentJobId) return;
    const card = findCard(currentJobId);
    if (!card) { closePanel(); return; }
    renderPanel(card);
  }

  function renderPanel(card) {
    els.panelTitle.textContent = card.customer || "Unknown";
    els.panelSub.textContent = "#" + shortId(card.jobId) + " · " + (card.printMethod || "UNKNOWN");

    const d = els.panelDetails;
    d.innerHTML = "";
    const addRow = (k, v) => {
      const dt = document.createElement("dt"); dt.textContent = k;
      const dd = document.createElement("dd"); dd.textContent = v == null || v === "" ? "—" : String(v);
      d.appendChild(dt); d.appendChild(dd);
    };
    addRow("Due", card.dueDate ? new Date(card.dueDate).toLocaleDateString() + "  (" + fmtDue(card.dueDate) + ")" : "—");
    addRow("Method", card.printMethod || "UNKNOWN");
    addRow("Qty", card.qty || 0);
    addRow("Color", card.color || "—");
    addRow("Priority", card.priority || 0);
    addRow("Status", card.shopStatus || card.status || "—");
    addRow("Source", card.source || "—");

    const ul = els.panelTasks;
    ul.innerHTML = "";
    const bundle = tasksByJob[card.jobId];
    const tasks = bundle && Array.isArray(bundle.tasks) ? bundle.tasks : [];
    if (!tasks.length) {
      const li = document.createElement("li");
      li.textContent = "No task template for this method.";
      li.style.color = "var(--ink-soft)";
      ul.appendChild(li);
    } else {
      const done = checked[card.jobId] || new Set();
      tasks.forEach((t, idx) => {
        const li = document.createElement("li");
        if (done.has(idx)) li.classList.add("done");
        const cb = document.createElement("input");
        cb.type = "checkbox"; cb.checked = done.has(idx);
        cb.addEventListener("change", () => {
          const set = checked[card.jobId] || new Set();
          if (cb.checked) set.add(idx); else set.delete(idx);
          checked[card.jobId] = set;
          persistChecked();
          li.classList.toggle("done", cb.checked);
        });
        const span = document.createElement("span");
        span.textContent = t.name;
        const num = document.createElement("span");
        num.className = "step-num";
        num.textContent = "step " + (t.order || idx + 1);
        li.appendChild(cb); li.appendChild(span); li.appendChild(num);
        ul.appendChild(li);
      });
    }

    els.panelNotes.textContent = card.notes && card.notes.trim() ? card.notes : "No notes.";
  }

  async function moveJob(status) {
    if (!currentJobId) return;
    const id = currentJobId;
    const result = await fetchJson("/jobs/update-status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobId: id, status }),
    });
    if (!result || !result.success) {
      alert("Failed to update: " + (result && (result.reason || result.error) || "unknown"));
      return;
    }
    closePanel();
    loadBoard({ silent: true });
  }

  function bind() {
    document.querySelectorAll("[data-action]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const a = btn.getAttribute("data-action");
        if (a === "refresh") { loadBoard({ silent: true }); return; }
        if (a === "run") {
          els.statusPill.textContent = "RUNNING…";
          await fetchJson("/command", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ input: "run system" }),
          });
          loadBoard({ silent: true });
          return;
        }
        if (a === "batches") { window.open("/production/batches", "_blank"); return; }
        if (a === "tasks") { window.open("/production/tasks", "_blank"); return; }
      });
    });

    document.querySelectorAll("[data-move]").forEach((btn) => {
      btn.addEventListener("click", () => moveJob(btn.getAttribute("data-move")));
    });

    els.panelClose.addEventListener("click", closePanel);
    els.scrim.addEventListener("click", closePanel);
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") closePanel(); });
  }

  function startAutoRefresh() {
    if (refreshTimer) clearInterval(refreshTimer);
    let remaining = AUTO_REFRESH_MS / 1000;
    els.sTimer.textContent = remaining + "s";
    refreshTimer = setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) {
        remaining = AUTO_REFRESH_MS / 1000;
        loadBoard({ silent: false });
      }
      els.sTimer.textContent = remaining + "s";
    }, 1000);
  }

  function boot() {
    bind();
    loadBoard({ silent: true }).then(startAutoRefresh);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
