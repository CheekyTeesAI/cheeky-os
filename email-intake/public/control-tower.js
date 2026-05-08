(function () {
  "use strict";

  let lastContentPostId = "";

  async function fetchJson(url, opts) {
    const r = await fetch(url, opts || {});
    const t = await r.text();
    try {
      return JSON.parse(t);
    } catch {
      return { raw: t };
    }
  }

  function el(html) {
    const d = document.createElement("div");
    d.innerHTML = html.trim();
    return d.firstChild;
  }

  function renderAlerts(alerts) {
    const box = document.getElementById("alerts");
    if (!alerts || !alerts.length) {
      box.textContent = "";
      return;
    }
    box.textContent = alerts.map((a) => `[${a.level}] ${a.source}: ${a.message}`).join(" · ");
  }

  function renderTower(data) {
    document.getElementById("tower-time").textContent = data.time ? data.time.slice(11, 19) + "Z" : "—";
    renderAlerts(data.alerts);

    const oi = data.opsInbound || {};
    const strip = document.getElementById("ops-inbound-strip");
    if (oi && oi.todayCounts && strip) {
      strip.style.display = "";
      strip.textContent = `Today — email: ${oi.todayCounts.emailsIngested ?? 0} · SMS: ${oi.todayCounts.sms ?? 0} · calls: ${oi.todayCounts.calls ?? 0} · art queue: ${oi.artQueueCount ?? 0} · print-ready: ${oi.printReadyArtCount ?? 0}${oi.degraded ? " · phone provider: degraded/offline" : ""}`;
    } else if (strip) {
      strip.style.display = "none";
    }

    const gl = data.goLive || {};
    const gld = document.getElementById("golive-body");
    if (gld) {
      if (gl.error) {
        gld.textContent = gl.error;
      } else {
        gld.innerHTML = [
          `<div class="row-line">Mode: <strong>${gl.globalMode || "—"}</strong> · Ready: <strong>${gl.ready ? "yes" : "no"}</strong> · Score: <strong>${gl.score ?? "—"}</strong></div>`,
          (gl.blockers || []).length
            ? `<div class="mono-small">Blockers: ${(gl.blockers || []).slice(0, 4).join(" · ")}</div>`
            : "",
          (gl.warnings || []).length
            ? `<div class="mono-small">Warnings: ${(gl.warnings || []).slice(0, 3).join(" · ")}</div>`
            : "",
        ].join("");
      }
    }

    const sh = data.systemHealth || {};
    document.getElementById("system-body").textContent = JSON.stringify(
      {
        status: sh.status,
        automation: sh.automation,
        control: sh.controlState,
        deployOk: sh.deploy && sh.deploy.ok,
      },
      null,
      2
    );

    const pr = data.production || {};
    const counts = pr.counts || {};
    document.getElementById("prod-body").innerHTML = [
      `<div class="row-line"><strong>Ready</strong> ${counts.ready ?? 0} · <strong>In production</strong> ${counts.inProduction ?? 0} · <strong>Blocked</strong> ${counts.blocked ?? 0} · <strong>Done</strong> ${counts.completed ?? 0}</div>`,
      pr.mock ? `<div class="mono-small">Mock / degraded</div>` : "",
    ].join("");

    const sd = data.serviceDesk || {};
    const sum = sd.summary || {};
    document.getElementById("sd-body").innerHTML = [
      `<div class="row-line">Escalated: <strong>${sum.escalatedCount ?? 0}</strong> · Waiting team: ${sum.waitingTeamCount ?? 0} · Waiting customer: ${sum.waitingCustomerCount ?? 0}</div>`,
      (sd.escalated || []).slice(0, 3).map((i) => `<div class="mono-small">${i.id} — ${(i.summary || "").slice(0, 100)}</div>`).join(""),
    ].join("");

    const ap = data.approvals || {};
    document.getElementById("ap-body").innerHTML = [
      `<div class="row-line">Comms pending: <strong>${(ap.communications || []).length}</strong> · PO approvals: <strong>${(ap.purchaseOrders || []).length}</strong> · Other: ${(ap.other || []).length}</div>`,
    ].join("");

    const m = data.money || {};
    document.getElementById("money-body").innerHTML =
      m.error
        ? `<span class="mono-small">${m.error}</span>`
        : `<div class="row-line">Open ~$${Number(m.openRevenue || 0).toFixed(0)} · Overdue ~$${Number(m.overdueRevenue || 0).toFixed(0)} · Unpaid jobs: ${m.unpaidJobs ?? 0}</div>`;

    const pu = data.purchasing || {};
    document.getElementById("pur-body").textContent = pu.error
      ? pu.error
      : `${pu.lineCount || 0} lines · ${pu.totalUnits || 0} units`;

    const ad = data.adoption || {};
    const secAd = document.getElementById("sec-adoption");
    if (ad && ad.showSetupCards) {
      secAd.style.display = "";
      const tr = ad.training || {};
      const dm = ad.demo || {};
      const fr = ad.firstRun || {};
      document.getElementById("adoption-body").innerHTML = [
        `<div class="row-line">First-run: <strong>${fr.isFirstRun ? "yes" : "no"}</strong> · Training: <strong>${tr.enabled ? "on" : "off"}</strong> · Demo seeded: <strong>${dm.seeded ? "yes" : "no"}</strong></div>`,
        ad.checklistSummary
          ? `<div class="mono-small">Checklist: ${ad.checklistSummary.completed}/${ad.checklistSummary.total} marked complete</div>`
          : "",
        (fr.missingCoreSetup || []).length
          ? `<div class="mono-small">Missing: ${(fr.missingCoreSetup || []).join(", ")}</div>`
          : "",
      ].join("");
    } else {
      secAd.style.display = "none";
    }

    const ct = data.content || {};
    lastContentPostId = "";
    document.getElementById("content-body").innerHTML = ct.idea
      ? `<div class="row-line">${(ct.idea || "").slice(0, 220)}</div><div class="mono-small">Status: ${ct.status || "—"} · ${ct.postType || ""}</div>`
      : "—";
    if (ct.postId) lastContentPostId = ct.postId;
  }

  async function loadTower() {
    const data = await fetchJson("/control-tower");
    if (!data.success) {
      document.getElementById("system-body").textContent = data.error || "failed";
      return;
    }
    renderTower(data);
  }

  async function runCommand() {
    const input = document.getElementById("cmd-input");
    const out = document.getElementById("cmd-out");
    const text = String(input.value || "").trim();
    if (!text) return;
    out.textContent = "…";
    const res = await fetchJson("/command", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input: text }),
    });
    try {
      out.textContent = JSON.stringify(res, null, 2);
    } catch {
      out.textContent = String(res);
    }
  }

  document.getElementById("cmd-run").addEventListener("click", runCommand);
  document.getElementById("cmd-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter") runCommand();
  });

  async function contentAction(path, body) {
    await fetchJson(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body || {}),
    });
    await loadTower();
  }

  document.getElementById("btn-approve-content").addEventListener("click", () =>
    contentAction("/content/approve", { postId: lastContentPostId })
  );
  document.getElementById("btn-skip-content").addEventListener("click", () =>
    contentAction("/content/skip", { postId: lastContentPostId })
  );
  document.getElementById("btn-posted-content").addEventListener("click", () =>
    contentAction("/content/complete", { postId: lastContentPostId })
  );

  document.getElementById("btn-setup-safe").addEventListener("click", async () => {
    await fetchJson("/setup/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "SAFE" }),
    });
    await loadTower();
  });
  document.getElementById("btn-demo-seed").addEventListener("click", async () => {
    if (!window.confirm("Seed demo data? (Creates isDemo records.)")) return;
    await fetchJson("/setup/demo/seed", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirm: true }),
    });
    await loadTower();
  });
  document.getElementById("btn-training-on").addEventListener("click", async () => {
    await fetchJson("/setup/training/enable", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    await loadTower();
  });

  document.getElementById("btn-golive-preview").addEventListener("click", async () => {
    const out = await fetchJson("/go-live/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetMode: "LIVE" }),
    });
    document.getElementById("cmd-out").textContent = JSON.stringify(out, null, 2);
    await loadTower();
  });
  document.getElementById("btn-golive-cutover").addEventListener("click", async () => {
    if (!window.confirm("Execute LIVE cutover? Requires readiness (see preview).")) return;
    const out = await fetchJson("/go-live/cutover", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetMode: "LIVE", confirm: true }),
    });
    document.getElementById("cmd-out").textContent = JSON.stringify(out, null, 2);
    await loadTower();
  });

  loadTower();
})();
