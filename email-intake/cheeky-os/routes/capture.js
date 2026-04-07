/**
 * Bundle 3 — POST /capture/quick-entry
 * Bundle 9 — POST /capture/verbal-brief, GET /capture/founder
 */

const express = require("express");
const { parseQuickCapture } = require("../services/quickCaptureParser");
const { normalizeVerbalBrief } = require("../services/verbalBriefNormalize");
const { evaluateFounderLogic } = require("../services/founderLogicService");
const { createOrderFromCapture } = require("../services/capturePipelineService");

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

/** Bundle 10 — convert reviewed brief to CaptureOrder (no schema change). */
router.post("/convert-to-order", async (req, res) => {
  try {
    const body = req.body || {};
    if (body.readyForOrder !== true) {
      return res.json({
        success: false,
        error: "Brief is not ready for order conversion",
      });
    }
    const n = body.normalized || {};
    const logic = body.logic || {};
    const customerName = String(n.customerName != null ? n.customerName : "").trim();
    const quantity = Math.max(0, Math.floor(Number(n.quantity) || 0));
    const product = String(n.product != null ? n.product : "").trim();
    const printType = String(n.printType != null ? n.printType : "").trim();

    const productType = String(n.productType != null ? n.productType : "").trim();
    if (
      !customerName ||
      quantity <= 0 ||
      !product ||
      !printType ||
      printType === "unknown" ||
      productType === "unknown"
    ) {
      return res.json({
        success: false,
        error: "Brief is not ready for order conversion",
      });
    }

    const result = await createOrderFromCapture({
      customer: customerName,
      quantity,
      product,
      print: printType,
      due: String(n.dueText != null ? n.dueText : "").trim(),
    });

    if (!result.success) {
      return res.json({
        success: false,
        error: result.error || "Order creation failed",
      });
    }

    return res.json({
      success: true,
      orderId: result.orderId,
      customerName,
      status: "INTAKE",
      priority: String(logic.priority != null ? logic.priority : "low"),
    });
  } catch (err) {
    console.error("[capture/convert-to-order]", err.message || err);
    return res.json({
      success: false,
      error: "Brief is not ready for order conversion",
    });
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
  <p style="opacity:0.88;margin:0 0 14px;font-size:1rem;line-height:1.45;">Paste rough job brief below</p>

  <div style="background:#151922;border:1px solid #2a3f55;border-radius:14px;padding:14px 16px;margin-bottom:20px;font-size:0.92rem;line-height:1.55;">
    <div style="font-size:0.72rem;text-transform:uppercase;letter-spacing:0.08em;color:#7dd3fc;margin-bottom:8px;">Recommended flow</div>
    <strong>1.</strong> Review brief &nbsp;→&nbsp; <strong>2.</strong> Convert to order &nbsp;→&nbsp; <strong>3.</strong> Generate tasks &nbsp;→&nbsp; <strong>4.</strong> Move into production
  </div>

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
      window.__briefState = { data: null, orderId: null };

      function showErr(msg) {
        err.textContent = msg || "Something went wrong";
        err.style.display = "block";
      }
      function hideErr() { err.style.display = "none"; }

      function priStyle(p) {
        var x = String(p || "").toLowerCase();
        if (x === "critical") return "color:#ef4444;font-weight:800;font-size:1.45rem;";
        if (x === "high") return "color:#f97316;font-weight:800;font-size:1.25rem;";
        return "color:#93c5fd;font-weight:700;";
      }
      function riskStyle(r) {
        var x = String(r || "").toLowerCase();
        if (x === "high") return "color:#fb7185;font-weight:800;font-size:1.25rem;";
        return "color:#a7f3d0;font-weight:600;";
      }

      function escapeHtml(s) {
        return String(s)
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;");
      }

      window.cheekyConvertToOrder = function () {
        var d = window.__briefState && window.__briefState.data;
        if (!d) return;
        var st = document.getElementById("action-status");
        if (st) st.textContent = "Creating order…";
        fetch("/capture/convert-to-order", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            rawText: d.rawText,
            normalized: d.normalized,
            logic: d.logic,
            readyForOrder: d.readyForOrder
          })
        })
          .then(function (r) { return r.json(); })
          .then(function (j) {
            if (j.success && j.orderId) {
              window.__briefState.orderId = j.orderId;
              if (st) {
                st.innerHTML = "Order created — ID <strong style='color:#7dd3fc'>" +
                  escapeHtml(j.orderId) + "</strong>. Next: generate tasks.";
              }
              var bt = document.getElementById("btn-tasks");
              if (bt) bt.disabled = false;
            } else {
              if (st) st.textContent = escapeHtml(j.error || "Conversion failed");
              alert(j.error || "Conversion failed");
            }
          })
          .catch(function () {
            if (st) st.textContent = "Network error";
            showErr("Network error");
          });
      };

      window.cheekyGenerateTasks = function () {
        var d = window.__briefState && window.__briefState.data;
        var oid = window.__briefState && window.__briefState.orderId;
        var L = d && d.logic ? d.logic : {};
        var st = document.getElementById("action-status");
        if (!oid) {
          alert("Create an order first.");
          return;
        }
        if (st) st.textContent = "Generating tasks…";
        fetch("/orders/generate-tasks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            orderId: oid,
            priority: L.priority,
            riskLevel: L.riskLevel,
            riskFlags: L.riskFlags || []
          })
        })
          .then(function (r) { return r.json(); })
          .then(function (j) {
            if (j.success) {
              var msg = "Created " + j.tasksCreated + " task(s).";
              if (j.taskTitles && j.taskTitles.length) {
                msg += " " + j.taskTitles.join(", ");
              }
              if (st) st.textContent = msg;
            } else {
              alert(j.error || "Task generation failed");
            }
          })
          .catch(function () { showErr("Network error"); });
      };

      function render(data) {
        window.__briefState = { data: data, orderId: null };
        var L = data.logic || {};
        var n = data.normalized || {};
        var p = data.parsed || {};
        var ready = data.readyForOrder === true;

        var decisionBg = ready ? "#0f1f14" : "#2a1510";
        var decisionBorder = ready ? "#166534" : "#9a3412";
        var readyLine = ready
          ? '<div style="margin-top:12px;font-size:1.05rem;font-weight:800;color:#4ade80;">Ready for order: YES</div><div style="margin-top:8px;font-size:0.92rem;opacity:0.9;">Convert to Order → then Generate Tasks</div>'
          : '<div style="margin-top:12px;font-size:1.05rem;font-weight:800;color:#fb923c;">Ready for order: NO</div><div style="margin-top:8px;font-size:0.92rem;">Needs clarification before conversion</div>';

        var btnConvert = ready
          ? '<button type="button" id="btn-convert" onclick="window.cheekyConvertToOrder()" style="width:100%;min-height:54px;margin-top:14px;font-size:1.05rem;font-weight:800;border:none;border-radius:12px;background:#16a34a;color:#fff;cursor:pointer;">Convert to Order</button>'
          : "";

        var decision =
          '<section style="margin-bottom:22px;padding:18px;border-radius:16px;background:' +
          decisionBg +
          ";border:2px solid " +
          decisionBorder +
          ';">' +
          '<div style="font-size:0.75rem;text-transform:uppercase;letter-spacing:0.1em;color:#94a3b8;margin-bottom:12px;">Decision panel</div>' +
          '<div style="display:grid;gap:10px;">' +
          '<div><span style="opacity:0.75;font-size:0.85rem;">Priority</span><div style="' +
          priStyle(L.priority) +
          '">' +
          escapeHtml(L.priority || "—") +
          "</div></div>" +
          '<div><span style="opacity:0.75;font-size:0.85rem;">Risk level</span><div style="' +
          riskStyle(L.riskLevel) +
          '">' +
          escapeHtml(L.riskLevel || "—") +
          "</div></div>" +
          '<div><span style="opacity:0.75;font-size:0.85rem;">Next step</span><div style="font-size:1.08rem;font-weight:700;line-height:1.4;">' +
          escapeHtml(L.nextStep || "—") +
          "</div></div>" +
          readyLine +
          "</div>" +
          btnConvert +
          '<button type="button" id="btn-tasks" disabled onclick="window.cheekyGenerateTasks()" style="width:100%;min-height:54px;margin-top:10px;font-size:1.05rem;font-weight:800;border:none;border-radius:12px;background:#7c3aed;color:#fff;cursor:pointer;opacity:0.85;">Generate tasks</button>' +
          '<p id="action-status" style="margin:12px 0 0;font-size:0.92rem;opacity:0.9;"></p>' +
          "</section>";

        var detail =
          '<section style="margin-bottom:20px;"><h2 style="font-size:1rem;color:#94a3b8;text-transform:uppercase;letter-spacing:0.06em;margin:0 0 10px;">Parsed</h2>' +
          '<pre style="white-space:pre-wrap;background:#151922;padding:14px;border-radius:12px;border:1px solid #2a3140;font-size:0.95rem;margin:0;">' +
          escapeHtml(JSON.stringify(p, null, 2)) +
          "</pre></section>" +
          '<section style="margin-bottom:20px;"><h2 style="font-size:1rem;color:#94a3b8;text-transform:uppercase;letter-spacing:0.06em;margin:0 0 10px;">Normalized</h2>' +
          '<pre style="white-space:pre-wrap;background:#151922;padding:14px;border-radius:12px;border:1px solid #2a3140;font-size:0.95rem;margin:0;">' +
          escapeHtml(JSON.stringify(n, null, 2)) +
          "</pre></section>" +
          '<section style="margin-bottom:16px;"><h2 style="font-size:1rem;color:#94a3b8;text-transform:uppercase;letter-spacing:0.06em;margin:0 0 8px;">Risk flags</h2>' +
          '<pre style="white-space:pre-wrap;background:#151922;padding:14px;border-radius:12px;border:1px solid #2a3140;font-size:0.95rem;margin:0;">' +
          escapeHtml(JSON.stringify(L.riskFlags || [], null, 2)) +
          "</pre></section>" +
          '<section style="margin-bottom:16px;"><h2 style="font-size:1rem;color:#94a3b8;text-transform:uppercase;letter-spacing:0.06em;margin:0 0 8px;">Notes</h2>' +
          '<pre style="white-space:pre-wrap;background:#151922;padding:14px;border-radius:12px;border:1px solid #2a3140;font-size:0.95rem;margin:0;">' +
          escapeHtml(JSON.stringify(L.notes || [], null, 2)) +
          "</pre></section>";

        out.innerHTML = decision + detail;
        out.style.display = "block";
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
