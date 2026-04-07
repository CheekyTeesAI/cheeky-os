/**
 * Bundle 3 — POST /capture/quick-entry
 * Bundle 9 — POST /capture/verbal-brief, GET /capture/founder
 */

const express = require("express");
const { parseQuickCapture } = require("../services/quickCaptureParser");
const { normalizeVerbalBrief } = require("../services/verbalBriefNormalize");
const { evaluateFounderLogic } = require("../services/founderLogicService");

const router = express.Router();

function emptyVerbalBriefResponse() {
  return {
    rawText: "",
    parsed: {
      customer: "",
      quantity: 0,
      product: "",
      print: "",
      due: "",
    },
    normalized: {
      customerName: "",
      quantity: 0,
      product: "",
      productType: "",
      printType: "",
      dueText: "",
      flags: [],
      confidence: "low",
    },
    logic: {
      priority: "low",
      riskLevel: "low",
      riskFlags: [],
      nextStep: "",
      notes: [],
    },
    readyForOrder: false,
  };
}

router.post("/quick-entry", (req, res) => {
  try {
    const rawText = req.body && req.body.rawText;
    const parsed = parseQuickCapture(rawText);
    res.json(parsed);
  } catch {
    res.json({
      customer: "",
      quantity: 0,
      product: "",
      print: "",
      due: "",
    });
  }
});

router.post("/verbal-brief", (req, res) => {
  try {
    const rawText = String(
      req.body && req.body.rawText != null ? req.body.rawText : ""
    );
    const parsed = parseQuickCapture(rawText);
    const normalized = normalizeVerbalBrief(parsed, rawText);
    const logicInput = {
      customerName: normalized.customerName,
      quantity: normalized.quantity,
      product: normalized.product,
      productType: normalized.productType,
      printType: normalized.printType,
      dueText: normalized.dueText,
      flags: normalized.flags,
      confidence: normalized.confidence,
      status: normalized.status,
      paymentStatus: normalized.paymentStatus,
      rawText: normalized.rawText,
    };
    const logic = evaluateFounderLogic(logicInput);
    const readyForOrder =
      normalized.quantity > 0 &&
      normalized.productType !== "unknown" &&
      normalized.printType !== "unknown";

    res.json({
      rawText,
      parsed: {
        customer: parsed.customer,
        quantity: parsed.quantity,
        product: parsed.product,
        print: parsed.print,
        due: parsed.due,
      },
      normalized: {
        customerName: normalized.customerName,
        quantity: normalized.quantity,
        product: normalized.product,
        productType: normalized.productType,
        printType: normalized.printType,
        dueText: normalized.dueText,
        flags: normalized.flags,
        confidence: normalized.confidence,
      },
      logic,
      readyForOrder,
    });
  } catch {
    res.json(emptyVerbalBriefResponse());
  }
});

router.get("/founder", (_req, res) => {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"/>
  <title>Founder Brief Workbench</title>
</head>
<body style="margin:0;padding:16px;padding-bottom:max(28px,env(safe-area-inset-bottom));font-family:system-ui,-apple-system,sans-serif;background:#0c0e12;color:#e8eaed;max-width:560px;margin-left:auto;margin-right:auto;">
  <h1 style="font-size:1.45rem;margin:8px 0 10px;color:#7dd3fc;letter-spacing:0.02em;">FOUNDER BRIEF WORKBENCH</h1>
  <p style="opacity:0.88;margin:0 0 18px;font-size:1rem;line-height:1.45;">Paste rough job brief below</p>

  <form id="brief-form" style="margin-bottom:24px;">
    <label for="rawText" style="display:block;font-size:0.85rem;opacity:0.75;margin-bottom:8px;">Brief</label>
    <textarea id="rawText" name="rawText" rows="6" style="width:100%;box-sizing:border-box;padding:16px;font-size:1.05rem;border-radius:12px;border:1px solid #2a3140;background:#151922;color:#e8eaed;min-height:160px;"></textarea>
    <button type="submit" style="margin-top:16px;width:100%;min-height:54px;font-size:1.1rem;font-weight:700;border:none;border-radius:12px;background:#2563eb;color:#fff;cursor:pointer;">Review brief</button>
  </form>

  <div id="err" style="display:none;color:#f87171;margin-bottom:16px;font-size:0.95rem;"></div>
  <div id="out" style="display:none;"></div>

  <script>
    (function () {
      var form = document.getElementById("brief-form");
      var out = document.getElementById("out");
      var err = document.getElementById("err");
      function showErr(msg) {
        err.textContent = msg || "Something went wrong";
        err.style.display = "block";
      }
      function hideErr() { err.style.display = "none"; }
      function priStyle(p) {
        var x = String(p || "").toLowerCase();
        if (x === "critical") return "color:#ef4444;font-weight:800;font-size:1.35rem;";
        if (x === "high") return "color:#f97316;font-weight:800;font-size:1.2rem;";
        return "color:#93c5fd;font-weight:700;";
      }
      function riskStyle(r) {
        var x = String(r || "").toLowerCase();
        if (x === "high") return "color:#fb7185;font-weight:800;font-size:1.2rem;";
        return "color:#a7f3d0;font-weight:600;";
      }
      function render(data) {
        var L = data.logic || {};
        var n = data.normalized || {};
        var p = data.parsed || {};
        var ready = data.readyForOrder === true;
        var readyMsg = ready
          ? '<div style="margin-top:16px;padding:14px;border-radius:12px;background:#14532d;border:1px solid #22c55e;font-weight:700;color:#bbf7d0;">Ready to convert into order</div>'
          : '<div style="margin-top:16px;padding:14px;border-radius:12px;background:#431407;border:1px solid #ea580c;font-weight:700;color:#fed7aa;">Needs clarification before order creation</div>';
        out.innerHTML =
          '<section style="margin-bottom:20px;"><h2 style="font-size:1rem;color:#94a3b8;text-transform:uppercase;letter-spacing:0.06em;margin:0 0 10px;">Parsed</h2>' +
          '<pre style="white-space:pre-wrap;background:#151922;padding:14px;border-radius:12px;border:1px solid #2a3140;font-size:0.95rem;margin:0;">' +
          escapeHtml(JSON.stringify(p, null, 2)) +
          "</pre></section>" +
          '<section style="margin-bottom:20px;"><h2 style="font-size:1rem;color:#94a3b8;text-transform:uppercase;letter-spacing:0.06em;margin:0 0 10px;">Normalized</h2>' +
          '<pre style="white-space:pre-wrap;background:#151922;padding:14px;border-radius:12px;border:1px solid #2a3140;font-size:0.95rem;margin:0;">' +
          escapeHtml(JSON.stringify(n, null, 2)) +
          "</pre></section>" +
          '<section style="margin-bottom:16px;"><h2 style="font-size:1rem;color:#94a3b8;text-transform:uppercase;letter-spacing:0.06em;margin:0 0 8px;">Priority</h2>' +
          '<div style="' + priStyle(L.priority) + '">' + escapeHtml(L.priority || "—") + "</div></section>" +
          '<section style="margin-bottom:16px;"><h2 style="font-size:1rem;color:#94a3b8;text-transform:uppercase;letter-spacing:0.06em;margin:0 0 8px;">Risk level</h2>' +
          '<div style="' + riskStyle(L.riskLevel) + '">' + escapeHtml(L.riskLevel || "—") + "</div></section>" +
          '<section style="margin-bottom:16px;"><h2 style="font-size:1rem;color:#94a3b8;text-transform:uppercase;letter-spacing:0.06em;margin:0 0 8px;">Risk flags</h2>' +
          '<pre style="white-space:pre-wrap;background:#151922;padding:14px;border-radius:12px;border:1px solid #2a3140;font-size:0.95rem;margin:0;">' +
          escapeHtml(JSON.stringify(L.riskFlags || [], null, 2)) +
          "</pre></section>" +
          '<section style="margin-bottom:16px;"><h2 style="font-size:1rem;color:#94a3b8;text-transform:uppercase;letter-spacing:0.06em;margin:0 0 8px;">Next step</h2>' +
          '<div style="font-size:1.08rem;line-height:1.45;font-weight:600;">' + escapeHtml(L.nextStep || "—") + "</div></section>" +
          '<section style="margin-bottom:16px;"><h2 style="font-size:1rem;color:#94a3b8;text-transform:uppercase;letter-spacing:0.06em;margin:0 0 8px;">Notes</h2>' +
          '<pre style="white-space:pre-wrap;background:#151922;padding:14px;border-radius:12px;border:1px solid #2a3140;font-size:0.95rem;margin:0;">' +
          escapeHtml(JSON.stringify(L.notes || [], null, 2)) +
          "</pre></section>" +
          '<section><h2 style="font-size:1rem;color:#94a3b8;text-transform:uppercase;letter-spacing:0.06em;margin:0 0 8px;">Ready for order</h2>' +
          '<div style="font-size:1.15rem;font-weight:800;">' + (ready ? "YES" : "NO") + "</div>" +
          readyMsg +
          "</section>";
        out.style.display = "block";
      }
      function escapeHtml(s) {
        return String(s)
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;");
      }
      form.addEventListener("submit", function (e) {
        e.preventDefault();
        hideErr();
        out.style.display = "none";
        var text = (document.getElementById("rawText") || {}).value || "";
        fetch("/capture/verbal-brief", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rawText: text })
        })
          .then(function (r) { return r.json(); })
          .then(function (data) { render(data); })
          .catch(function () { showErr("Network error"); });
      });
    })();
  </script>
</body>
</html>`;
  res.type("html").send(html);
});

module.exports = router;
