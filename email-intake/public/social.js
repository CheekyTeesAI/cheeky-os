(function () {
  "use strict";

  async function fetchJson(url, opts) {
    const r = await fetch(url, opts || {});
    const t = await r.text();
    try {
      return JSON.parse(t);
    } catch {
      return { raw: t };
    }
  }

  let lastPostId = "";

  async function loadToday() {
    const data = await fetchJson("/content/today");
    const ideaEl = document.getElementById("today-idea");
    const capEl = document.getElementById("today-caption");
    const shotEl = document.getElementById("today-shots");
    const st = document.getElementById("today-status");
    const rem = document.getElementById("today-reminder");

    if (!data.success || !data.post) {
      ideaEl.textContent = data.error || "No post.";
      return;
    }

    lastPostId = data.postId || "";
    const p = data.post;
    st.textContent = data.status || "—";
    ideaEl.textContent = p.idea || "";
    capEl.textContent = p.caption || "";
    shotEl.innerHTML = "";
    (p.shotList || []).forEach((s) => {
      const li = document.createElement("li");
      li.textContent = s;
      shotEl.appendChild(li);
    });
    rem.textContent =
      data.reminder && data.reminder.shouldRemind
        ? data.reminder.message || "Reminder"
        : "";
  }

  async function loadQueue() {
    const data = await fetchJson("/content/queue");
    const ol = document.getElementById("queue-list");
    ol.innerHTML = "";
    if (!data.success || !data.posts || !data.posts.length) {
      ol.innerHTML = "<li class=\"subtle\">Queue empty</li>";
      return;
    }
    data.posts.forEach((row) => {
      const li = document.createElement("li");
      const t = row.payload && row.payload.idea ? row.payload.idea.slice(0, 120) : row.id;
      li.textContent = (row.id || "") + " — " + t;
      ol.appendChild(li);
    });
  }

  async function loadHistory() {
    const data = await fetchJson("/content/history?limit=12");
    const ol = document.getElementById("hist-list");
    ol.innerHTML = "";
    if (!data.success || !data.posts || !data.posts.length) {
      ol.innerHTML = "<li class=\"subtle\">No posted items yet</li>";
      return;
    }
    data.posts.forEach((row) => {
      const li = document.createElement("li");
      li.textContent = (row.date || "") + " — " + (row.payload && row.payload.postType ? row.payload.postType : "POST");
      ol.appendChild(li);
    });
  }

  async function boot() {
    await loadToday();
    await loadQueue();
    await loadHistory();

    document.getElementById("btn-refresh").addEventListener("click", async () => {
      await loadToday();
      await loadQueue();
      await loadHistory();
    });

    document.getElementById("btn-approve").addEventListener("click", async () => {
      await fetchJson("/content/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postId: lastPostId }),
      });
      await loadToday();
      await loadQueue();
    });

    document.getElementById("btn-skip").addEventListener("click", async () => {
      await fetchJson("/content/skip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postId: lastPostId }),
      });
      await loadToday();
    });

    document.getElementById("btn-posted").addEventListener("click", async () => {
      await fetchJson("/content/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postId: lastPostId }),
      });
      await loadToday();
      await loadHistory();
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
