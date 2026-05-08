(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);

  async function run(btn, path, method, body) {
    const prev = btn.textContent;
    btn.disabled = true;
    btn.textContent = "…";
    try {
      const res = await fetch(path, {
        method: method || "POST",
        headers: { "Content-Type": "application/json" },
        body: body && Object.keys(body).length ? JSON.stringify(body) : "{}",
      });
      const text = await res.text();
      let j = {};
      try {
        j = JSON.parse(text);
      } catch (_e) {
        j = { raw: text.slice(0, 200) };
      }
      btn.textContent = j.success === false ? "Error" : "OK";
      setTimeout(() => {
        btn.textContent = prev;
        btn.disabled = false;
      }, 800);
    } catch (e) {
      btn.textContent = "Fail";
      setTimeout(() => {
        btn.textContent = prev;
        btn.disabled = false;
      }, 800);
    }
  }

  function render(data) {
    const root = $("sections");
    root.innerHTML = "";
    const secs = (data && data.sections) || [];
    secs.forEach((sec) => {
      const s = document.createElement("section");
      s.appendChild(document.createElement("h2")).textContent = sec.title || "";
      (sec.items || []).forEach((item) => {
        const c = document.createElement("div");
        c.className = "card";
        c.appendChild(document.createElement("strong")).textContent = item.title || item.jobId;
        [
          ["Next", item.nextAction],
          ["Status", item.status],
          ["Print", item.printType],
          ["Qty", item.quantity],
          ["Where", item.locations],
        ].forEach(([k, v]) => {
          if (v == null || v === "—") return;
          const r = document.createElement("div");
          r.className = "row";
          r.textContent = k + ": " + v;
          c.appendChild(r);
        });
        if (item.notes) {
          const r = document.createElement("div");
          r.className = "row";
          r.textContent = item.notes;
          c.appendChild(r);
        }
        const bt = document.createElement("div");
        bt.className = "btns";
        (item.buttons || []).forEach((b) => {
          const btn = document.createElement("button");
          btn.type = "button";
          btn.textContent = b.label || b.action;
          btn.onclick = () => run(btn, b.path, b.method, b.body);
          bt.appendChild(btn);
        });
        c.appendChild(bt);
        s.appendChild(c);
      });
      root.appendChild(s);
    });
  }

  async function load() {
    $("out").textContent = "";
    const role = $("role").value || "printer";
    const res = await fetch("/operator/" + encodeURIComponent(role));
    const text = await res.text();
    let data = {};
    try {
      data = JSON.parse(text);
    } catch (_e) {
      $("out").textContent = "Bad response";
      return;
    }
    if (!data.success) {
      $("out").textContent = data.error || "failed";
      return;
    }
    render(data);
  }

  $("load").addEventListener("click", load);
  load();
})();
