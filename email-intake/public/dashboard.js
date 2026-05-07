(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const REPORT_ROUTE = "/api/reports/run?period=today";
  const REPORT_FALLBACK = "/summary/today";

  function escapeHtml(v) {
    return String(v ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function hoursOld(iso) {
    if (!iso) return null;
    const t = new Date(iso).getTime();
    if (!Number.isFinite(t)) return null;
    return (Date.now() - t) / (1000 * 60 * 60);
  }

  function itemAgeText(item) {
    const candidates = [
      item.updatedAt,
      item.createdAt,
      item.proofSentAt,
      item.depositRequestedAt,
      item.garmentOrderPlacedAt,
    ];
    for (const c of candidates) {
      const h = hoursOld(c);
      if (h != null) return `${Math.floor(h)}h`;
    }
    return "n/a";
  }

  function isOverdue(item) {
    if (item && Number(item.ageHours) > 24) return true;
    const age = hoursOld(item && (item.updatedAt || item.createdAt || item.proofSentAt));
    return age != null && age > 24;
  }

  function pill(status) {
    return `<span class="status-pill">${escapeHtml(status || "UNKNOWN")}</span>`;
  }

  function row(item, opts) {
    const overdue = isOverdue(item) ? " overdue" : "";
    const id = opts.advanceId ? String(opts.advanceId) : "";
    const btn = id
      ? ` <button class="advance" data-advance-id="${escapeHtml(id)}">Advance</button>`
      : "";
    return `<li class="${overdue.trim()}">
      <span class="meta">
        <strong>${escapeHtml(opts.title)}</strong>
        <span class="sub">${escapeHtml(opts.sub)}</span>
      </span>
      ${pill(opts.status)}
      ${btn}
    </li>`;
  }

  async function fetchJson(url) {
    try {
      const res = await fetch(url, { headers: { Accept: "application/json" } });
      const text = await res.text();
      let data = null;
      try { data = text ? JSON.parse(text) : null; } catch { data = null; }
      return { ok: res.ok, status: res.status, data };
    } catch (err) {
      return { ok: false, status: 0, data: null, error: String(err) };
    }
  }

  async function postAdvance(id) {
    const res = await fetch(`/api/tasks/${encodeURIComponent(id)}/advance`, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: "{}",
    });
    const txt = await res.text();
    let body = null;
    try { body = JSON.parse(txt); } catch { body = { error: txt }; }
    return { ok: res.ok, status: res.status, body };
  }

  function renderNeedsPrinting(queueData) {
    const ready = (queueData && queueData.ready) || [];
    if (!ready.length) return '<li class="empty">No items ready</li>';
    return ready.map((it) => row(it, {
      title: `${it.customerName || "Unknown"} · ${it.product || it.item || "item"} x${it.quantity || "?"}`,
      sub: `Order ${it.orderId || it.id || "n/a"} · Age ${itemAgeText(it)}`,
      status: it.status || "READY",
      advanceId: it.orderId || it.id || null,
    })).join("");
  }

  function renderGarmentOrders(payload) {
    const items = (payload && payload.items) || [];
    if (!items.length) return '<li class="empty">No garment blockers</li>';
    return items.map((it) => row(it, {
      title: `${it.customerName || "Unknown"} · ${it.title || it.garmentType || "Garment order"}`,
      sub: `Order ${it.orderId || "n/a"} · Age ${itemAgeText(it)}`,
      status: it.garmentOrderStatus || it.status || "PENDING",
      advanceId: it.taskId || it.orderId || null,
    })).join("");
  }

  function renderDeposit(payload) {
    const items = (payload && payload.items) || [];
    if (!items.length) return '<li class="empty">No deposit follow-ups</li>';
    return items.map((it) => row(it, {
      title: `${it.customerName || "Unknown"} · ${it.item || "Deposit follow-up"}`,
      sub: `Deposit ${it.depositPaid ?? "?"}/${it.depositRequired ?? "?"} · Age ${itemAgeText(it)}`,
      status: it.status || "AWAITING_DEPOSIT",
      advanceId: it.orderId || null,
    })).join("");
  }

  function renderWeekPlan(payload) {
    const grid = $("week-plan-grid");
    if (!grid) return;
    const week = (payload && payload.weeklyPlan) || [];
    if (!week.length) {
      grid.innerHTML = '<p class="muted">No week data — check /schedule/week</p>';
      return;
    }
    grid.innerHTML = week
      .map((d) => {
        const jobs = (d.assignedJobs || []).map((j) => `${escapeHtml(j.customer || j.jobId)} (${j.channel || "?"})`).join(", ") || "—";
        return `<div class="week-cell"><strong>${escapeHtml(d.date)}</strong> <span class="pill">${escapeHtml(d.capacityStatus || "")}</span><div class="sub">${jobs}</div></div>`;
      })
      .join("");
  }

  function renderPurchasing(payload) {
    const st = $("purchase-status");
    const sh = $("purchase-shortages");
    const bl = $("purchase-blocked");
    const po = $("purchase-po");
    if (!st) return;
    const inv = payload && payload.inventorySummary;
    const hasPlan = payload && Array.isArray(payload.requirements);
    st.textContent = hasPlan
      ? `Req ${payload.requirements.length} · Shortages ${(payload.shortages || []).length} · SKUs ${inv ? inv.skuCount : 0} (on-hand ${inv ? inv.totalOnHand : 0})`
      : "No purchase plan";
    if (sh) {
      const lines = (payload && payload.shortages) || [];
      sh.innerHTML = lines.length
        ? lines.slice(0, 14).map((x) => `<li><span class="meta"><strong>${escapeHtml(x.product)}</strong> ${escapeHtml(x.color)} ${escapeHtml(x.size)} ×${x.qtyShort}</span></li>`).join("")
        : '<li class="empty">None</li>';
    }
    if (bl) {
      const g = (payload && payload.garmentBlockedJobs) || [];
      bl.innerHTML = g.length
        ? g.slice(0, 10).map((x) => `<li><span class="meta"><strong>${escapeHtml(x.customer || x.jobId)}</strong><span class="sub">${escapeHtml((x.missing || []).length)} line(s)</span></span></li>`).join("")
        : '<li class="empty">None</li>';
    }
    if (po) {
      const pos = (payload && payload.purchaseOrders) || [];
      po.innerHTML = pos.length
        ? pos.slice(0, 8).map((p) => `<li><span class="meta"><strong>${escapeHtml(p.poNumber)}</strong> ${escapeHtml(p.supplier)} · ${p.totalUnits} u</span></li>`).join("")
        : '<li class="empty">None</li>';
    }
    const vr = $("vendor-ready");
    const vp = $("vendor-pending");
    const vs = $("vendor-status");
    const ready = (payload && payload.purchaseOrdersReady) || [];
    const pend = (payload && payload.pendingApprovals) || [];
    const vstat = (payload && payload.vendorOutboundStatus) || [];
    if (vr) {
      vr.innerHTML = ready.length
        ? ready.slice(0, 10).map((p) => `<li><span class="meta"><strong>${escapeHtml(p.poNumber)}</strong> <span class="sub">${escapeHtml(p.sendStatus || "")}</span></span></li>`).join("")
        : '<li class="empty">None ready</li>';
    }
    if (vp) {
      vp.innerHTML = pend.length
        ? pend.slice(0, 8).map((a) => `<li><span class="meta"><strong>${escapeHtml(a.id)}</strong> <span class="sub">${escapeHtml((a.payload && a.payload.poNumber) || "")}</span></span></li>`).join("")
        : '<li class="empty">None</li>';
    }
    if (vs) {
      const rows = vstat.filter((x) => /SENT|FAILED/i.test(String(x.sendStatus || "")));
      vs.innerHTML = rows.length
        ? rows.slice(0, 10).map((p) => `<li><span class="meta"><strong>${escapeHtml(p.poNumber)}</strong> <span class="sub">${escapeHtml(p.sendStatus)} ${escapeHtml(p.lastError || "")}</span></span></li>`).join("")
        : '<li class="empty">No sent/failed yet</li>';
    }
    renderIntake(payload);
    renderSquare(payload);
  }

  function renderSquare(payload) {
    const st = $("square-status");
    const unpaid = (payload && payload.unpaidInvoices) || [];
    const est = (payload && payload.openEstimates) || [];
    const blocked = (payload && payload.paymentBlockedJobs) || [];
    const flags = (payload && payload.reconciliationIssues) || [];
    const sq = payload && payload.squareStatus;
    if (st) {
      st.textContent = sq
        ? `Mode ${sq.mode || "?"} · last sync ${payload.lastSquareSync || "never"}`
        : "Square slice unavailable";
    }
    const lineInv = (x) =>
      `<li><span class="meta"><strong>${escapeHtml(x.squareInvoiceId || x.id || "?")}</strong> <span class="sub">${escapeHtml(String(x.amountDue != null ? x.amountDue : x.amount || ""))} ${escapeHtml(x.status || "")}</span></span></li>`;
    const u = $("square-unpaid");
    if (u) u.innerHTML = unpaid.length ? unpaid.slice(0, 10).map(lineInv).join("") : '<li class="empty">None</li>';
    const e = $("square-estimates");
    if (e) e.innerHTML = est.length ? est.slice(0, 10).map(lineInv).join("") : '<li class="empty">None</li>';
    const b = $("square-blocked");
    if (b) {
      b.innerHTML = blocked.length
        ? blocked
            .slice(0, 10)
            .map((x) => `<li><span class="meta"><strong>${escapeHtml(x.jobId || (x.evaluation && x.evaluation.jobId) || "?")}</strong></span></li>`)
            .join("")
        : '<li class="empty">None</li>';
    }
    const f = $("square-flags");
    if (f) {
      f.innerHTML = flags.length
        ? flags
            .slice(0, 8)
            .map((x) => `<li><span class="meta"><strong>${escapeHtml(x.type || "issue")}</strong> <span class="sub">${escapeHtml(x.reason || "")}</span></span></li>`)
            .join("")
        : '<li class="empty">None</li>';
    }
  }

  function renderIntake(payload) {
    const st = $("intake-status");
    const sum = payload && payload.intakeSummary;
    if (st) {
      st.textContent = sum
        ? `New ${sum.newCount} · Needs info ${sum.needsInfoCount} · Quote ${sum.readyForQuoteCount} · Job ${sum.readyForJobCount} · Review ${sum.reviewRequiredCount} · Today +${sum.newTodayCount || 0}`
        : "No intake summary (see /intake)";
    }
    const recent = (payload && payload.recentInquiries) || [];
    const today = new Date().toISOString().slice(0, 10);
    const line = (r) =>
      `<li><span class="meta"><strong>${escapeHtml(r.id)}</strong> <span class="sub">${escapeHtml(r.intent || "")} · ${escapeHtml(r.status || "")}</span></span></li>`;
    const nt = $("intake-new-today");
    if (nt) {
      const rows = recent.filter((r) => String(r.createdAt || "").slice(0, 10) === today);
      nt.innerHTML = rows.length ? rows.slice(0, 8).map(line).join("") : '<li class="empty">None</li>';
    }
    const ni = $("intake-needs-info");
    if (ni) {
      const rows = recent.filter((r) => String(r.status) === "NEEDS_INFO");
      ni.innerHTML = rows.length ? rows.slice(0, 8).map(line).join("") : '<li class="empty">None</li>';
    }
    const rq = $("intake-ready-quote");
    if (rq) {
      const rows = recent.filter((r) => String(r.status) === "READY_FOR_QUOTE");
      rq.innerHTML = rows.length ? rows.slice(0, 8).map(line).join("") : '<li class="empty">None</li>';
    }
    const rj = $("intake-ready-job");
    if (rj) {
      const rows = recent.filter((r) => String(r.status) === "READY_FOR_JOB");
      rj.innerHTML = rows.length ? rows.slice(0, 8).map(line).join("") : '<li class="empty">None</li>';
    }
    const rv = $("intake-review");
    if (rv) {
      const rows = recent.filter((r) => String(r.status) === "REVIEW_REQUIRED");
      rv.innerHTML = rows.length ? rows.slice(0, 8).map(line).join("") : '<li class="empty">None</li>';
    }
  }

  function renderBlockedOutsource(payload) {
    const bl = $("week-blocked-list");
    const os = $("week-outsource-list");
    if (bl) {
      const b = (payload && payload.blockedJobs) || [];
      bl.innerHTML = b.length
        ? b.slice(0, 12).map((x) => `<li><span class="meta"><strong>${escapeHtml(x.customer || x.jobId)}</strong><span class="sub">${escapeHtml((x.reasons || []).join(", "))}</span></span></li>`).join("")
        : '<li class="empty">None</li>';
    }
    if (os) {
      const o = (payload && payload.outsourcedJobs) || [];
      os.innerHTML = o.length
        ? o.slice(0, 12).map((x) => `<li><span class="meta"><strong>${escapeHtml(x.customer || x.jobId)}</strong><span class="sub">order by ${escapeHtml(x.recommendedOrderBy || "?")}</span></span></li>`).join("")
        : '<li class="empty">None</li>';
    }
  }

  function renderSummary(data) {
    if (!data || typeof data !== "object") return '<li class="empty">Summary unavailable</li>';
    const lines = [];
    if (data.data && typeof data.data === "object") {
      lines.push(`Daily: ${JSON.stringify(data.data.daily || {})}`);
      lines.push(`Weekly: ${JSON.stringify(data.data.weekly || {})}`);
    } else {
      if (data.revenue) lines.push(`Revenue: ${JSON.stringify(data.revenue)}`);
      if (data.operations) lines.push(`Operations: ${JSON.stringify(data.operations)}`);
    }
    if (!lines.length) lines.push(JSON.stringify(data));
    return lines.map((l) => `<li><span class="meta"><span class="sub">${escapeHtml(l)}</span></span></li>`).join("");
  }

  function setSectionStatus(id, message) {
    const el = $(id);
    if (el) el.textContent = message;
  }

  async function loadAll() {
    $("status-dot").className = "status-dot";
    $("status-text").textContent = "Refreshing...";

    const prod = await fetchJson("/api/production/queue");
    setSectionStatus("printing-status", prod.ok ? "Loaded /api/production/queue" : `Error ${prod.status}`);
    $("printing-list").innerHTML = renderNeedsPrinting(prod.data || {});

    const garment = await fetchJson("/api/operator/garment-orders");
    setSectionStatus("garment-status", garment.ok ? "Loaded /api/operator/garment-orders" : `Error ${garment.status}`);
    $("garment-list").innerHTML = renderGarmentOrders(garment.data || {});

    const deposit = await fetchJson("/api/operator/deposit-followups");
    setSectionStatus("deposit-status", deposit.ok ? "Loaded /api/operator/deposit-followups" : `Error ${deposit.status}`);
    $("deposit-list").innerHTML = renderDeposit(deposit.data || {});

    const sched = await fetchJson("/schedule/week");
    setSectionStatus("week-plan-status", sched.ok ? "Loaded /schedule/week" : `Schedule ${sched.status}`);
    renderWeekPlan(sched.data || {});
    renderBlockedOutsource(sched.data || {});

    const purch = await fetchJson("/purchasing/plan");
    setSectionStatus("purchase-status", purch.ok ? "Loaded /purchasing/plan" : `Purchasing ${purch.status}`);
    setSectionStatus("intake-status", purch.ok && purch.data && purch.data.intakeSummary ? "Loaded intake slice" : "Intake n/a");
    setSectionStatus("square-status", purch.ok && purch.data && purch.data.squareStatus ? "Loaded Square slice" : "Square n/a");
    renderPurchasing(purch.data || {});

    const report = await fetchJson(REPORT_ROUTE);
    if (report.ok) {
      setSectionStatus("today-summary-status", `Loaded ${REPORT_ROUTE}`);
      $("today-summary-list").innerHTML = renderSummary(report.data);
    } else {
      const fallback = await fetchJson(REPORT_FALLBACK);
      setSectionStatus(
        "today-summary-status",
        fallback.ok
          ? `Loaded ${REPORT_FALLBACK} (fallback)`
          : `Error ${report.status} / ${fallback.status}`
      );
      $("today-summary-list").innerHTML = renderSummary(fallback.data);
    }

    const allOk = prod.ok && garment.ok && deposit.ok && sched.ok && purch.ok;
    $("status-dot").className = `status-dot ${allOk ? "status-ok" : "status-bad"}`;
    $("status-text").textContent = allOk ? "Healthy" : "Partial";
    $("last-updated").textContent = new Date().toLocaleString();
  }

  document.addEventListener("click", async (ev) => {
    const btn = ev.target && ev.target.closest("button.advance");
    if (!btn) return;
    const id = btn.getAttribute("data-advance-id");
    if (!id) return;
    btn.disabled = true;
    try {
      const out = await postAdvance(id);
      if (!out.ok) {
        alert((out.body && out.body.error) || `Advance failed (${out.status})`);
      }
      await loadAll();
    } catch (err) {
      alert(String(err));
    } finally {
      btn.disabled = false;
    }
  });

  $("manual-refresh").addEventListener("click", loadAll);
  loadAll();
  setInterval(loadAll, 60000);
})();
