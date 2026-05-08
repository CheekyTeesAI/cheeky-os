(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);

  const els = {
    q: $("q"),
    btnRun: $("btn-run"),
    btnMic: $("btn-mic"),
    btnCancel: $("btn-cancel"),
    btnConfirm: $("btn-confirm"),
    answer: $("answer"),
    preview: $("preview"),
    previewText: $("preview-text"),
    statusPill: $("status-pill"),
    statusValue: $("status-value"),
    queue: $("queue"),
    queueSummary: $("queue-summary"),
    batches: $("batches"),
    batchesSummary: $("batches-summary"),
    blocked: $("blocked"),
    blockedSummary: $("blocked-summary"),
    purchasing: $("purchasing"),
    purchasingSummary: $("purchasing-summary"),
    routing: $("routing"),
    routingSummary: $("routing-summary"),
    plan: $("plan"),
    selfheal: $("selfheal"),
    financeSource: $("finance-source"),
    kRevenue: $("k-revenue"),
    kCost: $("k-cost"),
    kProfit: $("k-profit"),
    kMargin: $("k-margin"),
    kJobs: $("k-jobs"),
    kOverdue: $("k-overdue"),
    footTime: $("foot-time"),
    footMode: $("foot-mode"),
    commSummary: $("comm-summary"),
    commReady: $("comm-ready"),
    commPending: $("comm-pending"),
    commFailed: $("comm-failed"),
    commSent: $("comm-sent"),
    commLists: $("comm-lists"),
    sdSummary: $("sd-summary"),
    sdNew: $("sd-new"),
    sdTeam: $("sd-team"),
    sdCust: $("sd-cust"),
    sdEsc: $("sd-esc"),
    sdLists: $("sd-lists"),
    adminVersion: $("admin-version"),
    adminStartup: $("admin-startup"),
    adminStartupDetail: $("admin-startup-detail"),
    adminConfig: $("admin-config"),
    adminBackup: $("admin-backup"),
    btnAdminRefresh: $("btn-admin-refresh"),
    btnAdminBackup: $("btn-admin-backup"),
    btnAdminBootstrap: $("btn-admin-bootstrap"),
  };

  const QUICK = {
    today: "What jobs are due today?",
    queue: "What's in the production queue?",
    print: "What should we print first?",
    order: "What should we order?",
    finance: "What is the profit on jobs?",
    invoice: "Create invoice for 50 shirts for Amber HVAC",
  };

  let pendingInvoice = null;

  function fmtMoney(n) {
    const v = Number(n || 0);
    if (Math.abs(v) >= 1000) return "$" + v.toLocaleString(undefined, { maximumFractionDigits: 0 });
    return "$" + v.toFixed(2);
  }

  function fmtDue(iso) {
    if (!iso) return "—";
    const d = new Date(iso);
    if (!Number.isFinite(d.getTime())) return "—";
    const today = new Date();
    const diff = Math.round((d.setHours(0,0,0,0) - new Date(today).setHours(0,0,0,0)) / 86400000);
    if (diff === 0) return "due today";
    if (diff === 1) return "due tomorrow";
    if (diff < 0) return `${-diff}d overdue`;
    return `due in ${diff}d`;
  }

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined && text !== null) e.textContent = String(text);
    return e;
  }

  function row(cls) { return el("div", "row" + (cls ? " " + cls : "")); }

  function setEmpty(container, msg) {
    container.innerHTML = "";
    container.appendChild(el("div", "empty", msg));
  }

  function setStatus(mode, health) {
    const pill = els.statusPill;
    pill.classList.remove("ok", "warn", "bad");
    let label = "—";
    let cls = "warn";
    if (health === "OK" && mode === "live") { label = "LIVE • OK"; cls = "ok"; }
    else if (health === "OK") { label = "MOCK • OK"; cls = "warn"; }
    else if (health === "DEGRADED") { label = (mode === "live" ? "LIVE" : "MOCK") + " • DEGRADED"; cls = "warn"; }
    else if (health === "CRITICAL") { label = "CRITICAL"; cls = "bad"; }
    else { label = mode === "live" ? "LIVE" : "MOCK"; cls = mode === "live" ? "ok" : "warn"; }
    pill.classList.add(cls);
    els.statusValue.textContent = label;
    els.footMode.textContent = "mode: " + (mode || "?");
    els.footTime.textContent = new Date().toLocaleString();
  }

  async function fetchJson(url, opts) {
    try {
      const res = await fetch(url, opts || {});
      const text = await res.text();
      try { return JSON.parse(text); } catch (_e) { return { success: false, parseError: true, raw: text.slice(0, 200) }; }
    } catch (err) {
      return { success: false, networkError: true, message: (err && err.message) || "network_error" };
    }
  }

  function lockUI(locked) {
    els.btnRun.disabled = !!locked;
    els.btnMic.disabled = !!locked;
  }

  async function runCommand(input, extra) {
    hidePreview();
    els.answer.textContent = "Running…";
    lockUI(true);
    const body = Object.assign({ input: input || "" }, extra || {});
    const data = await fetchJson("/command", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    lockUI(false);
    renderCommandResponse(data, input);
    return data;
  }

  async function runSystem() {
    els.answer.textContent = "Running system…";
    lockUI(true);
    const data = await fetchJson("/command", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input: "run system" }),
    });
    lockUI(false);
    renderSnapshot(data);
    return data;
  }

  function renderCommandResponse(data, originalInput) {
    if (!data || data.networkError) {
      els.answer.textContent = "Network error: " + ((data && data.message) || "unreachable");
      setStatus("?", "CRITICAL");
      return;
    }

    const mock = Boolean(data.mock);

    if (data.type === "action" && data.action === "CREATE_INVOICE") {
      return renderInvoice(data, originalInput);
    }

    if (data.type === "action" && data.action === "ADD_JOB") {
      const job = data.result && data.result.job;
      els.answer.textContent = job
        ? `Job added: ${job.jobId} — ${job.customer || "Unknown"}.`
        : "Job added.";
      setStatus(mock ? "mock" : "live", "OK");
      runSystem();
      return;
    }

    if (data.type === "query" && data.result) {
      const r = data.result;
      const health = r.health || (mock ? "DEGRADED" : "OK");
      setStatus(mock ? "mock" : "live", health);
      const ans = (data.summary && String(data.summary).trim()) || r.answer || "OK";
      const intent = r.intent ? ` [${r.intent}]` : "";
      const count = typeof r.count === "number" ? ` — ${r.count} match${r.count === 1 ? "" : "es"}` : "";
      els.answer.textContent = ans + intent + count;

      renderQueue({ production: r.production, queue: r.queue });
      renderBatches({ production: r.production, batches: r.production ? r.production.batches : [] });
      renderBlocked({ production: r.production });
      renderPurchasing({ purchasing: r.purchasing });
      renderRouting({ routing: r.routing, vendors: r.vendors });
      renderPlan({ plan: r.plan });
      renderFinancials({ financials: r.financials, mock });
      return;
    }

    els.answer.textContent = JSON.stringify(data, null, 2).slice(0, 500);
  }

  function renderInvoice(data, originalInput) {
    const r = data.result || {};
    const inv = r.invoice || {};
    const mock = Boolean(r.mock);

    if (r.status === "PREVIEW") {
      pendingInvoice = { input: originalInput, invoice: inv };
      els.preview.classList.remove("hidden");
      els.previewText.textContent = r.preview || JSON.stringify(inv, null, 2);
      els.answer.textContent = r.message || "Preview ready. Confirm to send.";
      setStatus(mock ? "mock" : "live", "OK");
      return;
    }

    if (r.status === "MOCK_CONFIRMED") {
      els.answer.textContent = (r.message || "Invoice not sent — Square not connected.") + "\n" + (r.preview || "");
      setStatus("mock", "DEGRADED");
      pendingInvoice = null;
      return;
    }

    if (r.status === "LIVE") {
      els.answer.textContent = `✓ ${r.message || "Sent."}\nOrder ID: ${r.orderId || "—"}\n\n${r.preview || ""}`;
      setStatus("live", "OK");
      pendingInvoice = null;
      runSystem();
      return;
    }

    if (r.status === "FAILED_LIVE") {
      els.answer.textContent = `⚠ ${r.message || "Square call failed."}\n\n${r.preview || ""}`;
      setStatus("live", "DEGRADED");
      pendingInvoice = null;
      return;
    }

    if (!r.success) {
      els.answer.textContent = (r.message || r.reason || "Invoice error") + (r.preview ? "\n\n" + r.preview : "");
      return;
    }

    els.answer.textContent = JSON.stringify(r, null, 2).slice(0, 500);
  }

  async function confirmInvoice() {
    if (!pendingInvoice) return;
    els.answer.textContent = "Sending invoice…";
    lockUI(true);
    const data = await fetchJson("/command", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        input: pendingInvoice.input,
        confirm: true,
        qty: pendingInvoice.invoice.qty,
        garment: pendingInvoice.invoice.garment,
        color: pendingInvoice.invoice.color,
        customer: pendingInvoice.invoice.customer,
        printMethod: pendingInvoice.invoice.printMethod,
        unitPrice: pendingInvoice.invoice.unitPrice,
        notes: pendingInvoice.invoice.notes,
      }),
    });
    lockUI(false);
    hidePreview();
    renderCommandResponse(data, pendingInvoice.input);
  }

  function hidePreview() {
    els.preview.classList.add("hidden");
    pendingInvoice = null;
  }

  function renderSnapshot(data) {
    if (!data || data.networkError) {
      els.answer.textContent = "Network error: " + ((data && data.message) || "unreachable");
      setStatus("?", "CRITICAL");
      return;
    }
    const mock = Boolean(data.mock);
    const health = data.systemStatus && data.systemStatus.health ? data.systemStatus.health : (mock ? "DEGRADED" : "OK");
    setStatus(mock ? "mock" : "live", health);

    const ans = data.note || (data.success === false ? "Error: " + (data.error || "unknown") : "System snapshot loaded.");
    els.answer.textContent = ans;

    renderQueue(data);
    renderBatches(data);
    renderBlocked(data);
    renderPurchasing(data);
    renderRouting(data);
    renderPlan(data);
    renderFinancials(data);
    renderSelfHeal(data);
  }

  function renderQueue(data) {
    const ready = (data.production && data.production.ready) || data.queue || [];
    els.queueSummary.textContent = `${ready.length} ready`;
    if (!ready.length) { setEmpty(els.queue, "No ready jobs."); return; }
    els.queue.innerHTML = "";
    ready.forEach((j) => {
      const r = row(String(j.status || "").toUpperCase() === "OVERDUE" ? "warn" : "ok");
      const main = el("div", "main");
      main.appendChild(el("div", "title", `#${j.position || "?"} ${j.customer || "Unknown"}`));
      main.appendChild(el("div", "meta", `${j.productionType || j.printMethod || "UNKNOWN"} • ${fmtDue(j.dueDate)} • priority ${j.priority ?? j.priorityScore ?? 0}`));
      r.appendChild(main);
      r.appendChild(el("div", "side", j.routing && j.routing.location ? j.routing.location : (j.status || "")));
      els.queue.appendChild(r);
    });
  }

  function renderBatches(data) {
    const batches = (data.production && data.production.batches) || data.batches || [];
    els.batchesSummary.textContent = `${batches.length} batch${batches.length === 1 ? "" : "es"}`;
    if (!batches.length) { setEmpty(els.batches, "Nothing to batch yet."); return; }
    els.batches.innerHTML = "";
    batches.forEach((b) => {
      const r = row();
      const main = el("div", "main");
      main.appendChild(el("div", "title", `${b.batchId} — ${b.printMethod}`));
      main.appendChild(el("div", "meta", `${(b.garment || "").toLowerCase()} • ${(b.color || "").toLowerCase()} • ${b.size || (b.jobs ? b.jobs.length : 0)} job${(b.size || 0) === 1 ? "" : "s"}`));
      r.appendChild(main);
      r.appendChild(el("div", "side", `${b.size || (b.jobs ? b.jobs.length : 0)}`));
      els.batches.appendChild(r);
    });
  }

  function renderBlocked(data) {
    const blocked = (data.production && data.production.blocked) || [];
    els.blockedSummary.textContent = `${blocked.length} blocked`;
    if (!blocked.length) { setEmpty(els.blocked, "Nothing blocked."); return; }
    els.blocked.innerHTML = "";
    blocked.forEach((b) => {
      const r = row("bad");
      const main = el("div", "main");
      main.appendChild(el("div", "title", b.customer || "Unknown"));
      main.appendChild(el("div", "meta", `${b.status || ""} • ${fmtDue(b.dueDate)}`));
      const reasons = Array.isArray(b.reasons) ? b.reasons : (b.reason ? [b.reason] : []);
      if (reasons.length) {
        const wrap = el("div", "reasons");
        reasons.forEach((rr) => wrap.appendChild(el("span", "chip", rr)));
        main.appendChild(wrap);
      }
      r.appendChild(main);
      r.appendChild(el("div", "side", reasons[0] || "BLOCKED"));
      els.blocked.appendChild(r);
    });
  }

  function renderPurchasing(data) {
    const list = (data.purchasing && data.purchasing.list) || [];
    const units = list.reduce((s, x) => s + Number(x.total || 0), 0);
    els.purchasingSummary.textContent = `${list.length} line${list.length === 1 ? "" : "s"} • ${units} units`;
    if (!list.length) { setEmpty(els.purchasing, "Nothing to order."); return; }
    els.purchasing.innerHTML = "";
    list.forEach((line) => {
      const r = row();
      const main = el("div", "main");
      main.appendChild(el("div", "title", line.product));
      const sizes = line.sizes && typeof line.sizes === "object"
        ? Object.entries(line.sizes).map(([k, v]) => `${k}:${v}`).join(" ")
        : "";
      main.appendChild(el("div", "meta", `${(line.garment || "").toLowerCase()} • ${(line.color || "").toLowerCase()} • ${sizes}`));
      r.appendChild(main);
      r.appendChild(el("div", "side", `${line.total} units`));
      els.purchasing.appendChild(r);
    });
  }

  function renderRouting(data) {
    const routing = data.routing || [];
    const vendors = data.vendors || [];
    const vById = new Map(vendors.map((v) => [v.jobId, v]));
    els.routingSummary.textContent = `${routing.length} decision${routing.length === 1 ? "" : "s"}`;
    if (!routing.length) { setEmpty(els.routing, "No routing decisions yet."); return; }
    els.routing.innerHTML = "";
    routing.forEach((rt) => {
      const v = vById.get(rt.jobId);
      const r = row();
      const main = el("div", "main");
      main.appendChild(el("div", "title", `${rt.jobId} — ${rt.method}`));
      main.appendChild(el("div", "meta", `${rt.location || "IN_HOUSE"} • qty ${rt.qty || 0} • colors ${rt.colors || 1}${v ? " • vendor " + v.vendor : ""}`));
      if (Array.isArray(rt.reasons) && rt.reasons.length) {
        const wrap = el("div", "reasons");
        rt.reasons.slice(0, 2).forEach((rr) => wrap.appendChild(el("span", "chip", rr)));
        main.appendChild(wrap);
      }
      r.appendChild(main);
      r.appendChild(el("div", "side", v && v.vendor === "IN_HOUSE" ? "IN-HOUSE" : (v && v.vendor) || (rt.location || "IN-HOUSE")));
      els.routing.appendChild(r);
    });
  }

  function renderPlan(data) {
    const plan = Array.isArray(data.plan) ? data.plan : [];
    els.plan.innerHTML = "";
    if (!plan.length) {
      const li = document.createElement("li");
      li.textContent = "No plan yet — run the system.";
      li.style.color = "var(--ink-muted)";
      els.plan.appendChild(li);
      return;
    }
    plan.forEach((step) => {
      const li = document.createElement("li");
      li.textContent = step;
      els.plan.appendChild(li);
    });
  }

  function renderFinancials(data) {
    const f = data.financials || {};
    els.kRevenue.textContent = fmtMoney(f.totalRevenue);
    els.kCost.textContent = fmtMoney(f.totalCost);
    els.kProfit.textContent = fmtMoney(f.totalProfit);
    els.kMargin.textContent = (Number(f.marginPercent || 0)).toFixed(1) + "%";
    els.kJobs.textContent = String(f.totalJobs || (data.jobs ? data.jobs.length : 0));
    els.kOverdue.textContent = fmtMoney(f.overdueRevenue);
    els.financeSource.textContent = data.mock ? "mock data" : "live data";
  }

  function renderSelfHeal(data) {
    const gaps = Array.isArray(data.gaps) ? data.gaps : [];
    const fixes = Array.isArray(data.selfHeal) ? data.selfHeal : [];
    els.selfheal.innerHTML = "";
    if (!gaps.length && !fixes.length) { setEmpty(els.selfheal, "No gaps detected."); return; }
    const byGap = new Map(fixes.map((f) => [f.gap, f]));
    gaps.forEach((g) => {
      const key = typeof g === "string" ? g : (g.key || g.name || "UNKNOWN");
      const fix = byGap.get(key);
      const r = row(fix && fix.priority === "HIGH" ? "bad" : "warn");
      const main = el("div", "main");
      main.appendChild(el("div", "title", key));
      if (fix && fix.fix) main.appendChild(el("div", "meta", fix.fix));
      r.appendChild(main);
      const side = el("div", "side");
      const pri = fix && fix.priority ? fix.priority : "LOW";
      side.appendChild(el("span", "prio-" + pri.toLowerCase(), pri));
      r.appendChild(side);
      els.selfheal.appendChild(r);
    });
  }

  // ---------- Voice input ----------

  let recognition = null;
  let listening = false;

  function getSR() {
    return window.SpeechRecognition || window.webkitSpeechRecognition || null;
  }

  function startVoice() {
    const SR = getSR();
    if (!SR) {
      els.answer.textContent = "Voice input not supported in this browser. Type instead.";
      return;
    }
    if (listening && recognition) { recognition.stop(); return; }
    try {
      recognition = new SR();
      recognition.lang = "en-US";
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;
      recognition.onstart = () => {
        listening = true;
        els.btnMic.classList.add("listening");
        els.answer.textContent = "Listening…";
      };
      recognition.onerror = (e) => {
        listening = false;
        els.btnMic.classList.remove("listening");
        els.answer.textContent = "Voice error: " + (e && e.error ? e.error : "unknown");
      };
      recognition.onend = () => {
        listening = false;
        els.btnMic.classList.remove("listening");
      };
      recognition.onresult = (e) => {
        const transcript = e && e.results && e.results[0] && e.results[0][0] ? e.results[0][0].transcript : "";
        if (transcript) {
          els.q.value = transcript;
          runCommand(transcript);
        }
      };
      recognition.start();
    } catch (err) {
      els.answer.textContent = "Voice init failed: " + (err && err.message ? err.message : err);
    }
  }

  // ---------- Boot ----------

  function bind() {
    els.btnRun.addEventListener("click", () => runCommand(els.q.value.trim()));
    els.q.addEventListener("keydown", (e) => { if (e.key === "Enter") runCommand(els.q.value.trim()); });
    els.btnMic.addEventListener("click", startVoice);
    els.btnCancel.addEventListener("click", hidePreview);
    els.btnConfirm.addEventListener("click", confirmInvoice);
    document.querySelectorAll("[data-quick]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const k = btn.getAttribute("data-quick");
        if (k === "system") { runSystem(); return; }
        const q = QUICK[k] || k;
        els.q.value = q;
        runCommand(q);
      });
    });
  }

  async function loadServiceDesk() {
    const data = await fetchJson("/service-desk");
    if (!data || data.success === false || !els.sdLists) return;
    const s = data.serviceDeskSummary || {};
    if (els.sdSummary) {
      els.sdSummary.textContent =
        (s.newCount || 0) +
        " new · " +
        (s.waitingTeamCount || 0) +
        " team · " +
        (s.escalatedCount || 0) +
        " escalated";
    }
    if (els.sdNew) els.sdNew.textContent = String(s.newCount ?? 0);
    if (els.sdTeam) els.sdTeam.textContent = String(s.waitingTeamCount ?? 0);
    if (els.sdCust) els.sdCust.textContent = String(s.waitingCustomerCount ?? 0);
    if (els.sdEsc) els.sdEsc.textContent = String(s.escalatedCount ?? 0);
    els.sdLists.innerHTML = "";
    const esc = (data.ownerExceptions || []).slice(0, 5);
    const auto = (data.recentAutoHandled || []).slice(0, 5);
    if (esc.length) {
      els.sdLists.appendChild(el("div", "subtle", "Owner / escalations"));
      esc.forEach((row) => {
        const r = el("div", "row");
        const main = el("div", "main");
        main.appendChild(
          el("div", "title", (row.id || "?") + " · " + (row.state || "") + " · " + (row.category || ""))
        );
        if (row.summary) main.appendChild(el("div", "meta", row.summary));
        r.appendChild(main);
        els.sdLists.appendChild(r);
      });
    }
    if (auto.length) {
      els.sdLists.appendChild(el("div", "subtle", "Recent auto-handled"));
      auto.forEach((row) => {
        const r = el("div", "row");
        r.appendChild(
          el("div", "main", (row.id || "?") + " — " + (row.summary || "").slice(0, 120))
        );
        els.sdLists.appendChild(r);
      });
    }
    if (!esc.length && !auto.length) {
      els.sdLists.appendChild(el("div", "empty", "No service desk items yet."));
    }
  }

  async function loadCommunications() {
    const data = await fetchJson("/communications");
    if (!data || data.success === false || !els.commSummary) return;
    const s = data.communicationSummary || {};
    els.commSummary.textContent =
      (s.recommendedCount || 0) + " recommended · " + (s.pendingApprovalCount || 0) + " pending";
    if (els.commReady) els.commReady.textContent = String(s.recommendedCount ?? 0);
    if (els.commPending) els.commPending.textContent = String(s.pendingApprovalCount ?? 0);
    if (els.commFailed) els.commFailed.textContent = String(s.failedCount ?? 0);
    if (els.commSent) els.commSent.textContent = String(s.sentTodayCount ?? 0);
    if (!els.commLists) return;
    const rec = (data.communicationRecommendations || []).slice(0, 6);
    const fail = (data.failedCommunications || []).slice(0, 4);
    els.commLists.innerHTML = "";
    if (rec.length) {
      els.commLists.appendChild(el("div", "subtle", "Top recommendations"));
      rec.forEach((r) => {
        const row = el("div", "row");
        const main = el("div", "main");
        main.appendChild(el("div", "title", (r.templateKey || "?") + " · " + (r.relatedType || "") + " " + (r.relatedId || "")));
        if (r.reason) main.appendChild(el("div", "meta", r.reason));
        row.appendChild(main);
        row.appendChild(el("div", "side", r.priority || ""));
        els.commLists.appendChild(row);
      });
    }
    if (fail.length) {
      els.commLists.appendChild(el("div", "subtle", "Recent failures"));
      fail.forEach((f) => {
        const row = el("div", "row bad");
        row.appendChild(el("div", "main", (f.templateKey || "?") + " — " + (f.error || "error")));
        els.commLists.appendChild(row);
      });
    }
    if (!rec.length && !fail.length) {
      els.commLists.appendChild(el("div", "empty", "No communication items yet."));
    }
  }

  async function loadAdminSystem() {
    if (!els.adminStartup) return;
    try {
      const [st, cfg, bi, bk] = await Promise.all([
        fetchJson("/system/startup-check"),
        fetchJson("/system/config"),
        fetchJson("/system/build-info"),
        fetchJson("/system/backup"),
      ]);
      if (bi && bi.version && els.adminVersion) {
        els.adminVersion.textContent = "v" + bi.version + " · " + (bi.environment || "");
      }
      if (st && st.ok !== undefined) {
        els.adminStartup.textContent = st.ok ? "OK" : "Issues";
        els.adminStartup.style.color = st.ok ? "var(--ok)" : "var(--bad)";
        const crit = (st.critical && st.critical.length) || 0;
        const warn = (st.warnings && st.warnings.length) || 0;
        if (els.adminStartupDetail) {
          els.adminStartupDetail.textContent =
            crit + " critical · " + warn + " warnings";
        }
      }
      if (cfg && els.adminConfig) {
        const keys = ["app", "square", "email", "sms", "storage", "vendors"];
        let ready = 0;
        keys.forEach((k) => {
          if (cfg[k] && cfg[k].configured) ready += 1;
        });
        els.adminConfig.textContent = ready + " / " + keys.length + " subsystems ready";
      }
      if (bk && bk.backups && els.adminBackup) {
        const b0 = bk.backups[0];
        els.adminBackup.textContent = b0 ? b0.backupId : "None yet";
      }
    } catch (_e) {
      if (els.adminStartup) els.adminStartup.textContent = "—";
    }
  }

  function bindAdmin() {
    if (!els.btnAdminRefresh) return;
    els.btnAdminRefresh.addEventListener("click", () => loadAdminSystem());
    if (els.btnAdminBackup) {
      els.btnAdminBackup.addEventListener("click", async () => {
        els.btnAdminBackup.disabled = true;
        try {
          await fetchJson("/system/backup", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ mode: "FULL" }),
          });
          await loadAdminSystem();
        } finally {
          els.btnAdminBackup.disabled = false;
        }
      });
    }
    if (els.btnAdminBootstrap) {
      els.btnAdminBootstrap.addEventListener("click", async () => {
        if (!window.confirm("Run bootstrap? Creates missing defaults only.")) return;
        els.btnAdminBootstrap.disabled = true;
        try {
          await fetchJson("/system/bootstrap", { method: "POST" });
          await loadAdminSystem();
        } finally {
          els.btnAdminBootstrap.disabled = false;
        }
      });
    }
  }

  async function boot() {
    bind();
    bindAdmin();
    if (!getSR()) els.btnMic.setAttribute("title", "Voice not supported in this browser");
    const healthCmd = await fetchJson("/command", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input: "system status" }),
    });
    if (healthCmd && healthCmd.data && healthCmd.data.status && healthCmd.data.status.health) {
      setStatus(healthCmd.mock ? "mock" : "live", healthCmd.data.status.health);
    }
    runSystem();
    loadCommunications();
    loadServiceDesk();
    loadAdminSystem();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
