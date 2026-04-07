/**
 * Bundle 4 — GET /production/queue, GET /production/mobile
 */

const express = require("express");
const { getProductionQueue } = require("../services/orderStatusEngine");

const router = express.Router();

router.get("/queue", async (_req, res) => {
  try {
    const data = await getProductionQueue();
    res.json(data);
  } catch {
    res.json({ ready: [], printing: [], qc: [] });
  }
});

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * @param {{ orderId: string, customerName: string, product: string, quantity: number, printType: string, dueDate: string }} item
 * @param {string} sectionStatus READY | PRINTING | QC
 */
function cardHtml(item, sectionStatus) {
  const id = escapeHtml(item.orderId);
  const cust = escapeHtml(item.customerName || "—");
  const prod = escapeHtml(item.product || "—");
  const qty = Number(item.quantity) || 0;
  const print = escapeHtml(item.printType || "—");
  const due = escapeHtml(item.dueDate || "—");
  const label = escapeHtml(sectionStatus);

  let button = "";
  if (sectionStatus === "READY") {
    button = `<button type="button" class="btn" data-order="${id}" data-next="PRINTING">Start Printing</button>`;
  } else if (sectionStatus === "PRINTING") {
    button = `<button type="button" class="btn" data-order="${id}" data-next="QC">Move to QC</button>`;
  } else if (sectionStatus === "QC") {
    button = `<button type="button" class="btn btn-done" data-order="${id}" data-next="DONE">Complete</button>`;
  }

  return `
  <article class="card">
    <div class="card-head">
      <strong class="cust">${cust}</strong>
      <span class="badge">${label}</span>
    </div>
    <p class="line"><span class="muted">Product</span> ${prod} × ${qty}</p>
    <p class="line"><span class="muted">Print</span> ${print}</p>
    <p class="line"><span class="muted">Due</span> ${due}</p>
    ${button}
  </article>`;
}

function sectionHtml(title, emoji, items, sectionStatus) {
  const cards =
    items.length === 0
      ? '<p class="empty">Nothing here.</p>'
      : items.map((it) => cardHtml(it, sectionStatus)).join("");
  return `
  <section class="block">
    <h2>${emoji} ${title}</h2>
    <div class="cards">${cards}</div>
  </section>`;
}

router.get("/mobile", async (_req, res) => {
  try {
    const q = await getProductionQueue();
    const body = `
${sectionHtml("READY TO PRINT", "🔴", q.ready, "READY")}
${sectionHtml("PRINTING", "🟡", q.printing, "PRINTING")}
${sectionHtml("QC", "🟢", q.qc, "QC")}
`;
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"/>
  <title>Production — Cheeky OS</title>
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
      margin: 0;
      padding: 12px;
      padding-bottom: max(24px, env(safe-area-inset-bottom));
      background: #0f1115;
      color: #e8eaed;
      line-height: 1.45;
    }
    h1 { font-size: 1.35rem; margin: 0 0 16px; }
    .block { margin-bottom: 28px; }
    .block h2 { font-size: 1.05rem; margin: 0 0 12px; font-weight: 700; }
    .cards { display: flex; flex-direction: column; gap: 12px; }
    .card {
      background: #1a1d24;
      border-radius: 12px;
      padding: 14px 16px;
      border: 1px solid #2a2f3a;
    }
    .card-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; margin-bottom: 8px; }
    .cust { font-size: 1.1rem; }
    .badge {
      font-size: 0.72rem;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      background: #2a3140;
      color: #b8c0d0;
      padding: 6px 10px;
      border-radius: 8px;
      white-space: nowrap;
    }
    .line { margin: 6px 0; font-size: 0.95rem; }
    .muted { color: #8b939e; margin-right: 6px; }
    .empty { color: #6b7280; font-size: 0.95rem; margin: 0; }
    .btn {
      display: block;
      width: 100%;
      margin-top: 14px;
      padding: 16px 18px;
      font-size: 1.05rem;
      font-weight: 600;
      border: none;
      border-radius: 10px;
      background: #3b5bdb;
      color: #fff;
      cursor: pointer;
      min-height: 52px;
    }
    .btn:active { opacity: 0.88; }
    .btn-done { background: #2f9e44; }
    .err { color: #ff6b6b; font-size: 0.9rem; margin-top: 8px; display: none; }
    .err.show { display: block; }
  </style>
</head>
<body>
  <h1>Production</h1>
  <p id="err" class="err"></p>
  ${body}
  <script>
    (function () {
      function showErr(msg) {
        var el = document.getElementById("err");
        el.textContent = msg || "Update failed";
        el.classList.add("show");
        setTimeout(function () { el.classList.remove("show"); }, 4000);
      }
      document.body.addEventListener("click", function (e) {
        var t = e.target;
        if (!t || !t.getAttribute || t.tagName !== "BUTTON") return;
        var orderId = t.getAttribute("data-order");
        var next = t.getAttribute("data-next");
        if (!orderId || !next) return;
        t.disabled = true;
        fetch("/orders/update-status", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderId: orderId, status: next })
        })
          .then(function (r) { return r.json(); })
          .then(function (data) {
            if (data && data.success) {
              location.reload();
            } else {
              showErr("Could not update status");
              t.disabled = false;
            }
          })
          .catch(function () {
            showErr("Network error");
            t.disabled = false;
          });
      });
    })();
  </script>
</body>
</html>`;
    res.type("html").send(html);
  } catch {
    res.status(500).type("html").send("<!DOCTYPE html><html><body>Error</body></html>");
  }
});

module.exports = router;
