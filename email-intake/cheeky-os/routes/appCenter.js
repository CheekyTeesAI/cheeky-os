/**
 * Bundle UI — GET /app — mobile command center (compose-only; no business logic).
 */

const { Router } = require("express");
const { getCopilotTodayPayload } = require("../services/copilotService");
const { getDailySummary } = require("../services/dailySummaryService");
const { collectAutomationActions } = require("../services/automationActionsService");
const { getActiveAlertsSorted } = require("../services/alertStoreService");
const { getRevenueFollowups } = require("../services/revenueFollowups");
const { scoreFollowupOpportunities } = require("../services/followupScoringService");
const { getProductionQueue } = require("../services/orderStatusEngine");
const { prepareMessage } = require("../services/messagePrepService");
const { runSystemCheck } = require("../services/systemCheckService");
const { buildSalesLoop } = require("../services/salesLoopService");
const { readLastOperatorRun } = require("../services/salesOperatorService");
const { readLastRunbookRun } = require("../services/runbookService");
const { getState: getAutopilotState } = require("../services/autopilotGuardService");
const {
  readRecentEntries,
  readRecentNextStepEntries,
  readRecentAutoInvoiceEntries,
  readRecentReplyDraftEntries,
} = require("./responses");
const { pricingRiskSectionHtml } = require("./pricing");

const router = Router();

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function normalizeName(s) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

/**
 * @param {string} name
 * @param {{ unpaidInvoices?: object[], staleEstimates?: object[] }} rev
 */
function rowMatchName(name, rev) {
  const want = normalizeName(name);
  if (!want) return null;
  const rows = [
    ...(Array.isArray(rev.unpaidInvoices) ? rev.unpaidInvoices : []),
    ...(Array.isArray(rev.staleEstimates) ? rev.staleEstimates : []),
  ];
  for (const r of rows) {
    if (!r || typeof r !== "object") continue;
    const rn = normalizeName(/** @type {{customerName?:string}} */ (r).customerName);
    if (!rn) continue;
    if (want === rn || want.includes(rn) || rn.includes(want)) {
      return /** @type {{customerId?:string,phone?:string}} */ (r);
    }
  }
  return null;
}

function squareCustomerIdForName(name, rev) {
  const hit = rowMatchName(name, rev);
  return hit && hit.customerId ? String(hit.customerId).trim() : "";
}

function phoneForFollowupName(name, rev) {
  const hit = rowMatchName(name, rev);
  return hit && hit.phone ? String(hit.phone).replace(/\s/g, "") : "";
}

function sevColor(sev) {
  const u = String(sev || "").toUpperCase();
  if (u === "CRITICAL") return "#ef4444";
  if (u === "HIGH") return "#f97316";
  if (u === "MEDIUM") return "#fde047";
  return "#94a3b8";
}

const CARD =
  "background:#141414;border:1px solid #2a2a2a;border-radius:8px;padding:14px 16px;margin:8px 0;box-shadow:0 2px 8px rgba(0,0,0,0.35);";
const H2 =
  "font-size:1.15rem;font-weight:800;margin:20px 0 10px;color:#f0ff44;letter-spacing:0.02em;";
const BTN_FULL =
  "display:block;width:100%;box-sizing:border-box;min-height:48px;padding:14px 16px;margin-top:10px;border-radius:8px;font-weight:800;font-size:1rem;border:1px solid #f0ff44;background:#f0ff44;color:#0a0a0a;text-align:center;text-decoration:none;cursor:pointer;";
const BTN_SEC =
  "display:block;width:100%;box-sizing:border-box;min-height:48px;padding:14px 16px;margin-top:10px;border-radius:8px;font-weight:700;font-size:0.95rem;border:1px solid #444;background:#1a1a1a;color:#e8e8e8;text-align:center;text-decoration:none;cursor:pointer;";

router.get("/app", async (req, res) => {
  if (String(req.query.refresh || "") === "1") {
    try {
      await runSystemCheck();
    } catch (err) {
      console.error("[app] refresh runSystemCheck", err.message || err);
    }
  }

  let copilot = { message: "", topActions: [] };
  let summary = { counts: {}, highlights: {} };
  let actions = [];
  let alerts = [];
  /** @type {{ unpaidInvoices?: object[], staleEstimates?: object[] }} */
  let rev = { unpaidInvoices: [], staleEstimates: [] };
  let followupRows = [];
  let queue = { ready: [], printing: [], qc: [] };
  let salesLoop = {
    candidates: [],
    summary: {
      messageReadyCount: 0,
      invoiceReadyCount: 0,
      highPriorityCount: 0,
    },
  };

  try {
    const [cp, sum, actPack, revenue, q, sl] = await Promise.all([
      getCopilotTodayPayload(),
      getDailySummary(),
      collectAutomationActions(10),
      getRevenueFollowups(),
      getProductionQueue(),
      buildSalesLoop(),
    ]);
    copilot = cp || copilot;
    summary = sum || summary;
    actions = (actPack && actPack.actions) || [];
    rev = revenue || rev;
    queue = q || queue;
    salesLoop = sl && sl.candidates ? sl : salesLoop;
  } catch (err) {
    console.error("[app] data load", err.message || err);
  }

  try {
    const scored = scoreFollowupOpportunities(
      rev.unpaidInvoices || [],
      rev.staleEstimates || []
    );
    const metaById = new Map();
    for (const r of rev.unpaidInvoices || []) {
      if (r && r.id) metaById.set(String(r.id), r);
    }
    for (const r of rev.staleEstimates || []) {
      if (r && r.id) metaById.set(String(r.id), r);
    }
    followupRows = scored.slice(0, 6).map((s) => {
      const base = metaById.get(s.id) || {};
      const phone = String(
        (base && base.phone) || s.phone || ""
      ).trim();
      const customerId = String(
        (base && base.customerId) || ""
      ).trim();
      let smsText = "";
      try {
        const prep = prepareMessage({
          type: s.type === "invoice" ? "invoice" : "followup",
          customerName: s.customerName,
          amount: s.amount,
          daysOld: s.daysOld,
        });
        smsText = prep.message || "";
      } catch (_) {}
      return { ...s, phone, customerId, smsText };
    });
  } catch (err) {
    console.error("[app] followups", err.message || err);
  }

  try {
    alerts = getActiveAlertsSorted().slice(0, 6);
  } catch (_) {
    alerts = [];
  }

  const counts = summary.counts || {};
  const hl = summary.highlights || {};
  const summaryLines = [
    String(hl.topAction || "").trim(),
    String(hl.topCustomer || "").trim(),
    String(hl.biggestOpportunity || "").trim(),
  ].filter(Boolean);

  const copilotMsg = String(copilot.message || "").trim()
    || "Review summary and actions below.";

  const slSum = salesLoop.summary || {};
  function salesActionHint(ra) {
    const x = String(ra || "");
    if (x === "create_draft_invoice") return "Draft invoice ready";
    if (x === "send_followup") return "Follow up now";
    return "Manual review";
  }
  const slTop = (salesLoop.candidates || []).slice(0, 5);
  const autopilotState = getAutopilotState();
  const autopilotPanelHtml = `
  <section style="${CARD};border:2px solid ${
    autopilotState.killSwitchActive ? "#ef4444" : "#2a2a2a"
  };">
    <h2 style="font-size:1.05rem;font-weight:900;margin:0 0 10px;color:${
      autopilotState.killSwitchActive ? "#fda4af" : "#fca5a5"
    };">🛑 AUTOPILOT CONTROL</h2>
    <p style="margin:0 0 10px;font-size:0.78rem;opacity:0.78;line-height:1.45;">Safe Mode blocks outbound and production mutations until intentionally enabled.</p>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:0.84rem;">
      <div style="background:#101010;padding:10px;border-radius:8px;">
        <div style="opacity:0.65;font-size:0.7rem;">Autopilot</div>
        <div style="font-size:1rem;font-weight:900;color:${autopilotState.autopilotEnabled ? "#22c55e" : "#f87171"};">${esc(autopilotState.autopilotEnabled ? "ENABLED" : "DISABLED")}</div>
      </div>
      <div style="background:#101010;padding:10px;border-radius:8px;">
        <div style="opacity:0.65;font-size:0.7rem;">Kill Switch</div>
        <div style="font-size:1rem;font-weight:900;color:${autopilotState.killSwitchActive ? "#ef4444" : "#22c55e"};">${esc(autopilotState.killSwitchActive ? "ACTIVE" : "INACTIVE")}</div>
      </div>
      <div style="background:#101010;padding:10px;border-radius:8px;">
        <div style="opacity:0.65;font-size:0.7rem;">Safe Mode</div>
        <div style="font-size:1rem;font-weight:900;color:${autopilotState.safeMode ? "#f97316" : "#22c55e"};">${esc(autopilotState.safeMode ? "ON" : "OFF")}</div>
      </div>
      <div style="background:#101010;padding:10px;border-radius:8px;">
        <div style="opacity:0.65;font-size:0.7rem;">Changed By</div>
        <div style="font-size:0.95rem;font-weight:700;">${esc(String(autopilotState.lastChangedBy || "system"))}</div>
      </div>
    </div>
    <p style="margin:8px 0 0;font-size:0.75rem;opacity:0.7;">Last Changed: ${esc(String(autopilotState.lastChangedAt || "—"))}</p>
    <button type="button" id="app-autopilot-enable" style="${BTN_FULL}">Enable Autopilot</button>
    <button type="button" id="app-autopilot-disable" style="${BTN_SEC}">Disable Autopilot</button>
    <button type="button" id="app-autopilot-kill" style="display:block;width:100%;box-sizing:border-box;min-height:50px;padding:14px 16px;margin-top:10px;border-radius:8px;font-weight:900;font-size:1rem;border:1px solid #ef4444;background:#7f1d1d;color:#fee2e2;text-align:center;cursor:pointer;">ACTIVATE KILL SWITCH</button>
    <button type="button" id="app-autopilot-restore" style="${BTN_SEC}">Restore System</button>
    <p id="app-autopilot-msg" style="font-size:0.8rem;opacity:0.78;margin:8px 0 0;min-height:1em;"></p>
  </section>`;

  const salesLoopHtml = `
  <section style="${CARD}">
    <h2 style="font-size:1.05rem;font-weight:900;margin:0 0 12px;color:#f0ff44;">💰 SALES LOOP</h2>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;font-size:0.88rem;margin-bottom:12px;">
      <div style="background:#101010;padding:10px;border-radius:8px;text-align:center;">
        <div style="opacity:0.7;font-size:0.72rem;">Message Ready</div>
        <div style="font-size:1.25rem;font-weight:800;color:#86efac;">${esc(
          String(slSum.messageReadyCount ?? 0)
        )}</div>
      </div>
      <div style="background:#101010;padding:10px;border-radius:8px;text-align:center;">
        <div style="opacity:0.7;font-size:0.72rem;">Invoice Ready</div>
        <div style="font-size:1.25rem;font-weight:800;color:#fde047;">${esc(
          String(slSum.invoiceReadyCount ?? 0)
        )}</div>
      </div>
      <div style="background:#101010;padding:10px;border-radius:8px;text-align:center;">
        <div style="opacity:0.7;font-size:0.72rem;">High Priority</div>
        <div style="font-size:1.25rem;font-weight:800;color:#fb923c;">${esc(
          String(slSum.highPriorityCount ?? 0)
        )}</div>
      </div>
    </div>
    <button type="button" id="app-sales-run" style="${BTN_FULL}">Run Sales Cycle</button>
    <p id="app-sales-run-msg" style="font-size:0.8rem;opacity:0.75;margin:8px 0 0;min-height:1em;"></p>
    ${
      slTop.length === 0
        ? `<p style="margin:12px 0 0;opacity:0.65;font-size:0.9rem;">No candidates.</p>`
        : slTop
            .map((c) => {
              if (!c || typeof c !== "object") return "";
              const pri = String(c.priority || "").toUpperCase();
              const pcol = sevColor(pri);
              const hp =
                pri === "CRITICAL" || pri === "HIGH"
                  ? "border:2px solid " + pcol + ";"
                  : "border:1px solid #333;";
              const ch = [
                c.phone ? "Phone" : "",
                c.email ? "Email" : "",
              ]
                .filter(Boolean)
                .join(" · ");
              const chan = ch || "No channel";
              const hint = salesActionHint(c.recommendedAction);
              const prepType =
                c.recommendedAction === "create_draft_invoice"
                  ? "invoice"
                  : "followup";
              const cn = String(c.customerName || "").trim();
              const cid = String(c.customerId || "").trim();
              const amt = Number(c.amount) || 0;
              let invBtn = "";
              if (c.invoiceReady && cid && amt >= 200) {
                const payloadAttr = esc(
                  JSON.stringify({
                    amount: amt,
                    description: cn.slice(0, 200),
                  })
                );
                invBtn = `<form class="app-exec-form" style="margin-top:8px;">
            <input type="hidden" name="approved" value="true"/>
            <input type="hidden" name="actionType" value="invoice"/>
            <input type="hidden" name="orderId" value=""/>
            <input type="hidden" name="customerId" value="${esc(cid)}"/>
            <input type="hidden" name="payload" value="${payloadAttr}"/>
            <button type="submit" style="${BTN_SEC}">Create Draft Invoice</button>
          </form>`;
              }
              return `<div style="margin-top:12px;padding:12px;border-radius:8px;background:#101010;${hp}">
          <div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start;">
            <strong style="font-size:1.02rem;line-height:1.3;">${esc(cn || "—")}</strong>
            <span style="font-size:0.65rem;font-weight:900;color:${pcol};white-space:nowrap;">${esc(pri || "—")}</span>
          </div>
          <p style="margin:6px 0 0;font-size:0.88rem;">$${esc(String(Math.round(amt)))} · ${esc(String(c.daysOld ?? ""))}d · <span style="opacity:0.85;">${esc(
                String(c.recommendedAction || "")
              )}</span></p>
          <p style="margin:4px 0 0;font-size:0.78rem;opacity:0.75;">${esc(chan)}</p>
          <p style="margin:6px 0 0;font-size:0.82rem;font-weight:700;color:#a3e635;">${esc(hint)}</p>
          <button type="button" class="app-prep-msg" style="${BTN_SEC}"
            data-type="${esc(prepType)}"
            data-name="${esc(cn)}"
            data-amount="${esc(String(amt))}"
            data-days="${esc(String(c.daysOld ?? 0))}"
          >Prepare Message</button>
          <pre class="app-prep-out" style="display:none;margin-top:8px;padding:10px;border-radius:8px;background:#0a0a0a;border:1px solid #333;font-size:0.85rem;white-space:pre-wrap;word-break:break-word;color:#ddd;"></pre>
          ${invBtn}
        </div>`;
            })
            .join("")
    }
  </section>`;

  const lastOp = readLastOperatorRun();
  const opSum = (lastOp && lastOp.cycleSummary) || {};
  const opEvents = Array.isArray(lastOp && lastOp.events) ? lastOp.events : [];
  const opEventsShow = opEvents.slice(0, 3);
  const operatorPanelHtml = `
  <section style="${CARD}">
    <h2 style="font-size:1.05rem;font-weight:900;margin:0 0 10px;color:#a7f3d0;">🤖 SALES OPERATOR</h2>
    <p style="margin:0 0 12px;font-size:0.82rem;opacity:0.75;line-height:1.45;">Runs follow-up executor → interpret responses → next-step queue (no auto-invoice).</p>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:0.85rem;margin-bottom:12px;">
      <div style="background:#101010;padding:10px;border-radius:8px;">
        <div style="opacity:0.65;font-size:0.7rem;">Follow-ups sent</div>
        <div style="font-size:1.15rem;font-weight:800;color:#86efac;">${esc(
    String(opSum.followupsSent ?? 0)
  )}</div>
      </div>
      <div style="background:#101010;padding:10px;border-radius:8px;">
        <div style="opacity:0.65;font-size:0.7rem;">Responses processed</div>
        <div style="font-size:1.15rem;font-weight:800;color:#7dd3fc;">${esc(
    String(opSum.responsesProcessed ?? 0)
  )}</div>
      </div>
      <div style="background:#101010;padding:10px;border-radius:8px;">
        <div style="opacity:0.65;font-size:0.7rem;">Invoice-ready</div>
        <div style="font-size:1.15rem;font-weight:800;color:#fde047;">${esc(
    String(opSum.invoicesPrepared ?? 0)
  )}</div>
      </div>
      <div style="background:#101010;padding:10px;border-radius:8px;">
        <div style="opacity:0.65;font-size:0.7rem;">Actions queued</div>
        <div style="font-size:1.15rem;font-weight:800;color:#fdba74;">${esc(
    String(opSum.queuedActions ?? 0)
  )}</div>
      </div>
    </div>
    <div style="margin-bottom:10px;">
      <div style="font-size:0.72rem;font-weight:800;opacity:0.7;margin-bottom:6px;letter-spacing:0.04em;">LAST EVENTS</div>
      ${
        opEventsShow.length === 0
          ? `<p style="margin:0;opacity:0.6;font-size:0.88rem;">No run yet — tap below.</p>`
          : opEventsShow
              .map(
                (ev) =>
                  `<p style="margin:6px 0 0;font-size:0.84rem;line-height:1.4;opacity:0.9;">• ${esc(
                    String(ev).length > 140
                      ? String(ev).slice(0, 137) + "…"
                      : String(ev)
                  )}</p>`
              )
              .join("")
      }
    </div>
    <button type="button" id="app-operator-run" style="${BTN_FULL}">Run Sales Operator</button>
    <p id="app-operator-run-msg" style="font-size:0.8rem;opacity:0.75;margin:8px 0 0;min-height:1em;"></p>
  </section>`;

  const lastRb = readLastRunbookRun();
  const rbSum = (lastRb && lastRb.summary) || {};
  const rbEvents = Array.isArray(lastRb && lastRb.events) ? lastRb.events : [];
  const rbEventsShow = rbEvents.slice(0, 5);
  const runbookPanelHtml = `
  <section style="${CARD}">
    <h2 style="font-size:1.05rem;font-weight:900;margin:0 0 10px;color:#fcd34d;">⚙️ DAILY RUNBOOK</h2>
    <p style="margin:0 0 12px;font-size:0.82rem;opacity:0.75;line-height:1.45;">Runs full daily cycle: system check → sales operator → invoice executor → production → alert review. Does not send SMS/alerts automatically.</p>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:0.85rem;margin-bottom:12px;">
      <div style="background:#101010;padding:10px;border-radius:8px;">
        <div style="opacity:0.65;font-size:0.7rem;">Follow-ups</div>
        <div style="font-size:1.15rem;font-weight:800;color:#86efac;">${esc(
    String(rbSum.followups ?? 0)
  )}</div>
      </div>
      <div style="background:#101010;padding:10px;border-radius:8px;">
        <div style="opacity:0.65;font-size:0.7rem;">Draft invoices</div>
        <div style="font-size:1.15rem;font-weight:800;color:#fde047;">${esc(
    String(rbSum.invoices ?? 0)
  )}</div>
      </div>
      <div style="background:#101010;padding:10px;border-radius:8px;">
        <div style="opacity:0.65;font-size:0.7rem;">Production moves</div>
        <div style="font-size:1.15rem;font-weight:800;color:#7dd3fc;">${esc(
    String(rbSum.productionMoves ?? 0)
  )}</div>
      </div>
      <div style="background:#101010;padding:10px;border-radius:8px;">
        <div style="opacity:0.65;font-size:0.7rem;">Active alerts</div>
        <div style="font-size:1.15rem;font-weight:800;color:#fb923c;">${esc(
    String(rbSum.alerts ?? 0)
  )}</div>
      </div>
    </div>
    <div style="margin-bottom:10px;">
      <div style="font-size:0.72rem;font-weight:800;opacity:0.7;margin-bottom:6px;letter-spacing:0.04em;">LAST EVENTS (5)</div>
      ${
        rbEventsShow.length === 0
          ? `<p style="margin:0;opacity:0.6;font-size:0.88rem;">No runbook run yet — tap below.</p>`
          : rbEventsShow
              .map(
                (ev) =>
                  `<p style="margin:6px 0 0;font-size:0.84rem;line-height:1.4;opacity:0.9;">• ${esc(
                    String(ev).length > 140
                      ? String(ev).slice(0, 137) + "…"
                      : String(ev)
                  )}</p>`
              )
              .join("")
      }
    </div>
    <button type="button" id="app-runbook-run" style="${BTN_FULL}">Run Full System</button>
    <p id="app-runbook-run-msg" style="font-size:0.8rem;opacity:0.75;margin:8px 0 0;min-height:1em;"></p>
  </section>`;

  const recentIngest = readRecentEntries().entries.slice(0, 5);
  function responseActionHint(intent) {
    const i = String(intent || "");
    if (i === "ready_to_pay") return "Create Draft Invoice";
    if (i === "needs_revision") return "Review Revision Request";
    if (i === "question") return "Respond with Clarification";
    return "";
  }
  const responsesPanelHtml =
    recentIngest.length === 0
      ? `<section style="${CARD}">
    <h2 style="font-size:1.05rem;font-weight:900;margin:0 0 10px;color:#7dd3fc;">📥 CUSTOMER RESPONSES</h2>
    <p style="margin:0;opacity:0.65;font-size:0.9rem;line-height:1.45;">No ingested replies yet. Use <code style="background:#1a1a1a;padding:2px 6px;border-radius:4px;font-size:0.82rem;">POST /responses/ingest</code>.</p>
  </section>`
      : `<section style="${CARD}">
    <h2 style="font-size:1.05rem;font-weight:900;margin:0 0 12px;color:#7dd3fc;">📥 CUSTOMER RESPONSES</h2>
    ${recentIngest
      .map((row) => {
        if (!row || typeof row !== "object") return "";
        const intent = String(row.intent || "");
        const isPay = intent === "ready_to_pay";
        const border = isPay
          ? "border:2px solid #22c55e;box-shadow:0 0 12px rgba(34,197,94,0.2);"
          : "border:1px solid #333;";
        const hint = responseActionHint(intent);
        return `<div style="margin-top:10px;padding:12px;border-radius:8px;background:#101010;${border}">
        <strong style="font-size:1rem;line-height:1.3;">${esc(
          String(row.customerName || "—")
        )}</strong>
        <div style="font-size:0.72rem;font-weight:800;margin-top:6px;color:#a78bfa;letter-spacing:0.04em;">${esc(
          intent
        )}</div>
        <p style="margin:8px 0 0;font-size:0.88rem;line-height:1.45;opacity:0.92;">${esc(
          String(row.messagePreview || "")
        )}</p>
        <p style="margin:6px 0 0;font-size:0.82rem;opacity:0.78;">${esc(
          String(row.recommendedNextStep || "")
        )}</p>
        ${
          hint
            ? `<p style="margin:8px 0 0;font-size:0.8rem;font-weight:800;color:#f0ff44;">${esc(
                hint
              )}</p>`
            : ""
        }
      </div>`;
      })
      .join("")}
  </section>`;

  const recentNextSteps = readRecentNextStepEntries().entries.slice(0, 5);
  function nextStepUiHint(actionType) {
    const t = String(actionType || "");
    if (t === "invoice") return "Create Draft Invoice";
    if (t === "review") return "Review Now";
    if (t === "clarify") return "Respond Now";
    if (t === "later_followup") return "Schedule Later";
    return "";
  }
  const nextStepsPanelHtml =
    recentNextSteps.length === 0
      ? `<section style="${CARD}">
    <h2 style="font-size:1.05rem;font-weight:900;margin:0 0 10px;color:#fde047;">⚡ RESPONSE NEXT STEPS</h2>
    <p style="margin:0;opacity:0.65;font-size:0.9rem;line-height:1.45;">No queued next steps yet. Use <code style="background:#1a1a1a;padding:2px 6px;border-radius:4px;font-size:0.82rem;">POST /responses/queue-next-step</code>.</p>
  </section>`
      : `<section style="${CARD}">
    <h2 style="font-size:1.05rem;font-weight:900;margin:0 0 12px;color:#fde047;">⚡ RESPONSE NEXT STEPS</h2>
    ${recentNextSteps
      .map((row) => {
        if (!row || typeof row !== "object") return "";
        const priRaw = String(row.priority || "").toLowerCase();
        const priDisp = priRaw.toUpperCase();
        const pcol = sevColor(priDisp);
        const atype = String(row.actionType || "");
        const isCriticalInvoice =
          priRaw === "critical" && atype === "invoice";
        const isHighRq =
          priRaw === "high" && (atype === "review" || atype === "clarify");
        let border = "border:1px solid #333;";
        if (isCriticalInvoice) {
          border =
            "border:2px solid #22c55e;box-shadow:0 0 12px rgba(34,197,94,0.25);";
        } else if (isHighRq) {
          border =
            "border:2px solid #f97316;box-shadow:0 0 10px rgba(249,115,22,0.2);";
        }
        const hint = nextStepUiHint(atype);
        const reasonLine = String(row.reason || "").trim();
        return `<div style="margin-top:10px;padding:12px;border-radius:8px;background:#101010;${border}">
        <div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start;">
          <strong style="font-size:1rem;line-height:1.3;">${esc(
            String(row.customerName || "—")
          )}</strong>
          <span style="font-size:0.65rem;font-weight:900;color:${pcol};white-space:nowrap;">${esc(
            priDisp || "—"
          )}</span>
        </div>
        <div style="font-size:0.72rem;font-weight:800;margin-top:6px;color:#a78bfa;letter-spacing:0.04em;">${esc(
          String(row.intent || "")
        )}</div>
        <p style="margin:8px 0 0;font-size:0.92rem;font-weight:700;color:#e8e8e8;">${esc(
          String(row.actionLabel || "")
        )}</p>
        ${
          reasonLine
            ? `<p style="margin:6px 0 0;font-size:0.82rem;line-height:1.4;opacity:0.82;">${esc(
                reasonLine.length > 120
                  ? reasonLine.slice(0, 117) + "…"
                  : reasonLine
              )}</p>`
            : ""
        }
        ${
          hint
            ? `<p style="margin:8px 0 0;font-size:0.78rem;font-weight:800;color:#f0ff44;">${esc(
                hint
              )}</p>`
            : ""
        }
      </div>`;
      })
      .join("")}
  </section>`;

  const recentAutoInv = readRecentAutoInvoiceEntries().entries.slice(0, 5);
  function autoInvBorder(level) {
    const u = String(level || "").toLowerCase();
    if (u === "clear")
      return "border:2px solid #22c55e;box-shadow:0 0 10px rgba(34,197,94,0.2);";
    if (u === "review")
      return "border:2px solid #f97316;box-shadow:0 0 8px rgba(249,115,22,0.15);";
    return "border:2px solid #ef4444;opacity:0.95;";
  }
  const autoInvoicePanelHtml = `<section style="${CARD}">
    <h2 style="font-size:1.05rem;font-weight:900;margin:0 0 10px;color:#93c5fd;">🧾 AUTO-INVOICE READY</h2>
    <p style="margin:0 0 12px;font-size:0.8rem;opacity:0.72;line-height:1.45;"><strong>CLEAR</strong> = auto draft allowed · <strong>REVIEW</strong> = check manually · <strong>BLOCKED</strong> = do not auto-run</p>
    ${
      recentAutoInv.length === 0
        ? `<p style="margin:0 0 12px;opacity:0.65;font-size:0.88rem;">No checks yet. Submit the form below or call <code style="background:#1a1a1a;padding:2px 6px;border-radius:4px;font-size:0.78rem;">POST /responses/auto-invoice</code>.</p>`
        : recentAutoInv
            .map((row) => {
              if (!row || typeof row !== "object") return "";
              const sl = String(row.safetyLevel || "blocked");
              return `<div style="margin-top:10px;padding:12px;border-radius:8px;background:#101010;${autoInvBorder(sl)}">
          <strong style="font-size:0.98rem;">${esc(
            String(row.customerName || "—")
          )}</strong>
          <div style="font-size:0.7rem;font-weight:900;margin-top:6px;letter-spacing:0.05em;">${esc(sl.toUpperCase())}</div>
          <p style="margin:6px 0 0;font-size:0.86rem;">$${esc(String(Math.round(Number(row.amount) || 0)))} · intent ${esc(
            String(row.intent || "—")
          )}</p>
          <p style="margin:6px 0 0;font-size:0.8rem;line-height:1.4;opacity:0.85;">${esc(
            String(row.reason || "").length > 130
              ? String(row.reason).slice(0, 127) + "…"
              : String(row.reason || "")
          )}</p>
        </div>`;
            })
            .join("")
    }
    <form id="app-auto-invoice-form" style="margin-top:14px;padding-top:12px;border-top:1px solid #2a2a2a;">
      <label style="display:block;font-size:0.72rem;opacity:0.75;margin-bottom:4px;">Customer name</label>
      <input name="customerName" required style="width:100%;box-sizing:border-box;padding:10px;border-radius:8px;border:1px solid #333;background:#101010;color:#eee;font-size:0.95rem;margin-bottom:8px;"/>
      <label style="display:block;font-size:0.72rem;opacity:0.75;margin-bottom:4px;">Message (reply text)</label>
      <textarea name="message" required rows="2" style="width:100%;box-sizing:border-box;padding:10px;border-radius:8px;border:1px solid #333;background:#101010;color:#eee;font-size:0.95rem;margin-bottom:8px;"></textarea>
      <label style="display:block;font-size:0.72rem;opacity:0.75;margin-bottom:4px;">Square customer ID</label>
      <input name="customerId" style="width:100%;box-sizing:border-box;padding:10px;border-radius:8px;border:1px solid #333;background:#101010;color:#eee;font-size:0.95rem;margin-bottom:8px;"/>
      <label style="display:block;font-size:0.72rem;opacity:0.75;margin-bottom:4px;">Amount (USD)</label>
      <input name="amount" type="number" min="0" step="1" style="width:100%;box-sizing:border-box;padding:10px;border-radius:8px;border:1px solid #333;background:#101010;color:#eee;font-size:0.95rem;margin-bottom:8px;"/>
      <label style="display:block;font-size:0.72rem;opacity:0.75;margin-bottom:4px;">Order ID (optional)</label>
      <input name="orderId" style="width:100%;box-sizing:border-box;padding:10px;border-radius:8px;border:1px solid #333;background:#101010;color:#eee;font-size:0.95rem;margin-bottom:10px;"/>
      <button type="submit" style="${BTN_FULL}margin-top:0;">Run Auto-Invoice Check</button>
    </form>
    <p id="app-auto-invoice-msg" style="font-size:0.78rem;opacity:0.78;margin:8px 0 0;min-height:1em;"></p>
  </section>`;

  function replyDraftSortKey(intent) {
    const i = String(intent || "");
    if (i === "ready_to_pay") return 0;
    if (i === "needs_revision") return 1;
    if (i === "question") return 2;
    if (i === "interested") return 3;
    if (i === "not_now") return 4;
    return 5;
  }
  const replyDraftRows = readRecentReplyDraftEntries()
    .entries.slice()
    .sort((a, b) => {
      const da = replyDraftSortKey(a && a.intent);
      const db = replyDraftSortKey(b && b.intent);
      if (da !== db) return da - db;
      const ta = String((a && a.at) || "");
      const tb = String((b && b.at) || "");
      return tb.localeCompare(ta);
    })
    .slice(0, 5);
  function replyDraftBorder(intent) {
    const i = String(intent || "");
    if (i === "ready_to_pay")
      return "border:2px solid #22c55e;box-shadow:0 0 10px rgba(34,197,94,0.18);";
    if (i === "needs_revision")
      return "border:2px solid #f97316;box-shadow:0 0 8px rgba(249,115,22,0.15);";
    if (i === "question") return "border:2px solid #38bdf8;";
    return "border:1px solid #333;";
  }
  const replyDraftsPanelHtml = `<section style="${CARD}">
    <h2 style="font-size:1.05rem;font-weight:900;margin:0 0 10px;color:#e9d5ff;">💬 REPLY DRAFTS</h2>
    <p style="margin:0 0 12px;font-size:0.78rem;opacity:0.72;line-height:1.45;">Copy-only — nothing is sent automatically. From <code style="background:#1a1a1a;padding:2px 6px;border-radius:4px;font-size:0.76rem;">POST /responses/prepare-reply</code>.</p>
    ${
      replyDraftRows.length === 0
        ? `<p style="margin:0;opacity:0.65;font-size:0.88rem;">No drafts yet. Run prepare-reply or use the API.</p>`
        : replyDraftRows
            .map((row) => {
              if (!row || typeof row !== "object") return "";
              const intent = String(row.intent || "");
              const draft = String(row.draft || "");
              return `<div style="margin-top:12px;padding:12px;border-radius:8px;background:#101010;${replyDraftBorder(intent)}">
          <strong style="font-size:0.98rem;">${esc(
            String(row.customerName || "—")
          )}</strong>
          <div style="font-size:0.68rem;font-weight:800;margin-top:5px;color:#c4b5fd;letter-spacing:0.04em;">${esc(
            intent
          )}</div>
          <pre class="reply-draft-text" style="margin:10px 0 0;font-family:system-ui,sans-serif;font-size:0.88rem;line-height:1.45;white-space:pre-wrap;word-break:break-word;color:#e8e8e8;">${esc(
            draft
          )}</pre>
          <button type="button" class="app-copy-reply" style="${BTN_SEC}margin-top:8px;">Copy Reply</button>
        </div>`;
            })
            .join("")
    }
  </section>`;

  const copilotHtml = `
  <section style="${CARD}">
    <h2 style="font-size:1rem;font-weight:800;margin:0 0 12px;color:#f0ff44;">🧠 COPILOT SAYS</h2>
    <p style="margin:0;font-size:1.05rem;line-height:1.5;color:#e8e8e8;font-weight:600;">${esc(
      copilotMsg
    )}</p>
  </section>`;

  const summaryCountBits = [
    counts.urgentFollowups != null
      ? `Urgent follow-ups: ${esc(String(counts.urgentFollowups))}`
      : "",
    counts.readyToPrint != null
      ? `Ready to print: ${esc(String(counts.readyToPrint))}`
      : "",
    counts.inProduction != null
      ? `In production: ${esc(String(counts.inProduction))}`
      : "",
    counts.blockedOrders != null
      ? `Blocked: ${esc(String(counts.blockedOrders))}`
      : "",
  ].filter(Boolean);

  const summaryHtml = `
  <section style="${CARD}">
    <h2 style="${H2}">📊 TODAY SUMMARY</h2>
    <div style="font-size:0.95rem;line-height:1.55;color:#ccc;">
      ${summaryCountBits.map((l) => `<p style="margin:6px 0;">${l}</p>`).join("")}
      ${summaryLines
        .slice(0, 2)
        .map(
          (t) =>
            `<p style="margin:8px 0 0;font-size:0.98rem;line-height:1.45;color:#e8e8e8;">${esc(
              t.length > 120 ? t.slice(0, 117) + "…" : t
            )}</p>`
        )
        .join("")}
    </div>
  </section>`;

  const actionsHtml =
    actions.length === 0
      ? `<section style="${CARD}"><h2 style="${H2}">🚀 SYSTEM ACTIONS</h2><p style="margin:0;opacity:0.7;">No queued actions.</p></section>`
      : `<section style="${CARD}">
    <h2 style="${H2}">🚀 SYSTEM ACTIONS</h2>
    ${actions
      .map((a, idx) => {
        if (!a || typeof a !== "object") return "";
        const label = esc(String(a.label || "").trim() || "Action");
        const reason = esc(
          String(a.reason || "").trim().slice(0, 120)
        );
        const pri = esc(String(a.priority || "").toUpperCase());
        const pcol = sevColor(pri);
        const oid = esc(String(a.orderId || "").trim());
        const cn = String(a.customerName || "").trim();
        const cid = squareCustomerIdForName(cn, rev);
        const amt = Number(a.amount) || 0;
        const daysOld = Number(a.daysOld) || 0;
        const typ = String(a.type || "").toLowerCase();
        let script = "";
        try {
          const pr = prepareMessage({
            type: typ === "invoice" ? "invoice" : "followup",
            customerName: cn,
            amount: amt,
            daysOld,
          });
          script = pr.message || "";
        } catch (_) {}
        const phoneRaw = phoneForFollowupName(cn, rev);
        const tel = phoneRaw
          ? `<a href="tel:${esc(phoneRaw)}" style="${BTN_FULL}">Call</a>`
          : "";
        const textArea = script
          ? `<label style="display:block;font-size:0.75rem;opacity:0.75;margin-top:10px;">Text (copy)</label><textarea readonly rows="3" style="width:100%;box-sizing:border-box;margin-top:4px;padding:10px;border-radius:8px;border:1px solid #333;background:#0f0f0f;color:#e8e8e8;font-size:0.95rem;">${esc(
              script
            )}</textarea>`
          : "";
        let invoiceBtn = "";
        if (typ === "invoice" && cid && amt > 0) {
          const payloadAttr = esc(
            JSON.stringify({
              amount: amt,
              description: cn.slice(0, 200),
            })
          );
          invoiceBtn = `<form class="app-exec-form" style="margin:0;">
            <input type="hidden" name="approved" value="true"/>
            <input type="hidden" name="actionType" value="invoice"/>
            <input type="hidden" name="orderId" value="${oid}"/>
            <input type="hidden" name="customerId" value="${esc(cid)}"/>
            <input type="hidden" name="payload" value="${payloadAttr}"/>
            <button type="submit" style="${BTN_FULL}">Invoice</button>
          </form>`;
        }
        let printBtn = "";
        if (typ === "production" && oid) {
          printBtn = `<form class="app-status-form" style="margin:0;">
            <input type="hidden" name="orderId" value="${oid}"/>
            <input type="hidden" name="status" value="PRINTING"/>
            <button type="submit" style="${BTN_SEC}">Start Print</button>
          </form>`;
        }
        const sep =
          idx > 0
            ? "border-top:1px solid #2a2a2a;padding-top:12px;margin-top:12px;"
            : "padding-top:0;margin-top:0;";
        return `<div style="${sep}">
          <div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start;">
            <strong style="font-size:1.02rem;line-height:1.3;color:#f3f3f3;">${label}</strong>
            <span style="font-size:0.7rem;font-weight:800;color:${pcol};white-space:nowrap;">${pri}</span>
          </div>
          <p style="margin:8px 0 0;font-size:0.9rem;line-height:1.4;opacity:0.85;color:#ccc;">${reason}</p>
          <p style="margin:6px 0 0;font-size:0.88rem;color:#888;">${esc(
            cn || "—"
          )}</p>
          ${tel}
          ${textArea}
          ${invoiceBtn}
          ${printBtn}
        </div>`;
      })
      .filter(Boolean)
      .join("")}
  </section>`;

  const alertsHtml =
    alerts.length === 0
      ? `<section style="${CARD}"><h2 style="${H2}">🚨 ACTIVE ALERTS</h2><p style="margin:0;opacity:0.7;">None.</p></section>`
      : `<section style="${CARD}">
    <h2 style="${H2}">🚨 ACTIVE ALERTS</h2>
    ${alerts
      .map((a) => {
        if (!a || typeof a !== "object") return "";
       const msg = esc(
          String(/** @type {{message?:string}} */ (a).message || "").trim()
        );
       const sev = String(
          /** @type {{severity?:string}} */ (a).severity || ""
        ).toUpperCase();
       const col = sevColor(sev);
       const line = msg.length > 140 ? msg.slice(0, 137) + "…" : msg;
       return `<div style="margin-top:10px;padding:12px;border-radius:8px;border:1px solid #333;background:#101010;">
          <div style="display:flex;justify-content:space-between;gap:8px;">
            <span style="font-size:0.95rem;line-height:1.35;color:#eee;">${line}</span>
            <span style="font-size:0.65rem;font-weight:800;color:${col};">${esc(sev)}</span>
          </div>
        </div>`;
      })
      .join("")}
  </section>`;

  const followHtml =
    followupRows.length === 0
      ? `<section style="${CARD}"><h2 style="${H2}">💸 FOLLOW-UPS</h2><p style="margin:0;opacity:0.7;">No scored follow-ups.</p></section>`
      : `<section style="${CARD}">
    <h2 style="${H2}">💸 FOLLOW-UPS</h2>
    ${followupRows
      .map((u) => {
        const name = esc(String(u.customerName || "").trim() || "—");
        const pri = esc(String(u.priority || "").toUpperCase());
        const pcol = sevColor(pri);
        const phone = String(u.phone || "").replace(/\s/g, "");
        const tel = phone
          ? `<a href="tel:${esc(phone)}" style="${BTN_FULL}">Call</a>`
          : "";
        const sms = String(u.smsText || "").trim();
        const textBlock = sms
          ? `<textarea readonly rows="3" style="width:100%;box-sizing:border-box;margin-top:8px;padding:10px;border-radius:8px;border:1px solid #333;background:#0f0f0f;color:#e8e8e8;font-size:0.95rem;">${esc(
              sms
            )}</textarea>`
          : "";
        const cid = String(u.customerId || "").trim();
        const amt = Number(u.amount) || 0;
        let invForm = "";
        if (cid && amt > 0) {
          const payloadAttr = esc(
            JSON.stringify({
              amount: amt,
              description: String(u.customerName || "Order").slice(0, 200),
            })
          );
          invForm = `<form class="app-exec-form" style="margin-top:8px;">
            <input type="hidden" name="approved" value="true"/>
            <input type="hidden" name="actionType" value="invoice"/>
            <input type="hidden" name="orderId" value=""/>
            <input type="hidden" name="customerId" value="${esc(cid)}"/>
            <input type="hidden" name="payload" value="${payloadAttr}"/>
            <button type="submit" style="${BTN_SEC}">Invoice</button>
          </form>`;
        }
        return `<div style="margin-top:12px;padding-bottom:12px;border-bottom:1px solid #2a2a2a;">
          <strong style="font-size:1.02rem;">${name}</strong>
          <div style="font-size:0.72rem;font-weight:800;margin-top:6px;color:${pcol};">${pri}</div>
          <p style="margin:8px 0 0;font-size:0.92rem;">$${esc(
            String(Math.round(Number(u.amount) || 0))
          )} · ${esc(String(u.daysOld ?? ""))}d</p>
          ${tel}
          ${textBlock}
          ${invForm}
        </div>`;
      })
      .join("")}
  </section>`;

  function prodCard(item, sectionStatus) {
    const id = esc(item.orderId);
    const cust = esc(item.customerName || "—");
    const prod = esc(item.product || "—");
    const qty = Number(item.quantity) || 0;
    const due = esc(item.dueDate || "—");
    let next = "";
    let btnLabel = "";
    if (sectionStatus === "READY") {
      next = "PRINTING";
      btnLabel = "Start Print";
    } else if (sectionStatus === "PRINTING") {
      next = "QC";
      btnLabel = "Move to QC";
    } else if (sectionStatus === "QC") {
      next = "DONE";
      btnLabel = "QC Done";
    }
    const badgeColor =
      sectionStatus === "READY"
        ? "#22c55e"
        : sectionStatus === "PRINTING"
          ? "#f97316"
          : "#fde047";
    const btn =
      next &&
      `<form class="app-status-form" style="margin-top:10px;">
        <input type="hidden" name="orderId" value="${id}"/>
        <input type="hidden" name="status" value="${next}"/>
        <button type="submit" style="${BTN_FULL}">${esc(btnLabel)}</button>
      </form>`;
    return `<div style="margin-top:10px;padding:14px;border-radius:8px;border:1px solid #333;background:#101010;">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
        <strong style="font-size:1.02rem;line-height:1.3;">${cust}</strong>
        <span style="font-size:0.65rem;font-weight:800;padding:4px 8px;border-radius:6px;background:#1a1a1a;color:${badgeColor};">${esc(
      sectionStatus
    )}</span>
      </div>
      <p style="margin:8px 0 0;font-size:0.9rem;opacity:0.88;line-height:1.35;">${prod} × ${qty}</p>
      <p style="margin:4px 0 0;font-size:0.85rem;opacity:0.7;">Due ${due}</p>
      ${btn || ""}
    </div>`;
  }

  const prodHtml = `
  <section style="${CARD}">
    <h2 style="${H2}">🖨 PRODUCTION</h2>
    <p style="margin:0 0 8px;font-size:0.85rem;opacity:0.75;">READY · PRINTING · QC</p>
    ${queue.ready && queue.ready.length
      ? queue.ready.map((it) => prodCard(it, "READY")).join("")
      : ""}
    ${queue.printing && queue.printing.length
      ? queue.printing.map((it) => prodCard(it, "PRINTING")).join("")
      : ""}
    ${queue.qc && queue.qc.length
      ? queue.qc.map((it) => prodCard(it, "QC")).join("")
      : ""}
    ${(!queue.ready || !queue.ready.length) &&
    (!queue.printing || !queue.printing.length) &&
    (!queue.qc || !queue.qc.length)
      ? '<p style="opacity:0.65;margin:8px 0 0;">Queue empty.</p>'
      : ""}
  </section>`;

  const topBar = `
  <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:16px;">
    <a href="/app?refresh=1" style="flex:1;min-width:100px;text-align:center;${BTN_SEC}margin-top:0;">Refresh</a>
    <button type="button" id="app-send-alerts" style="flex:1;min-width:100px;${BTN_SEC.replace(
      "margin-top:10px",
      "margin-top:0"
    )}">Send Alerts</button>
    <button type="button" id="app-send-sms" style="flex:1;min-width:100px;${BTN_SEC.replace(
      "margin-top:10px",
      "margin-top:0"
    )}">Send SMS</button>
  </div>
  <p id="app-notify-msg" style="font-size:0.82rem;opacity:0.8;min-height:1.2em;"></p>`;

  const script = `
  <script>
  (function(){
    function msg(t){ var m=document.getElementById('app-notify-msg'); if(m) m.textContent=t||''; }
    document.getElementById('app-send-alerts') && document.getElementById('app-send-alerts').addEventListener('click',function(){
      msg('Sending…');
      fetch('/notifications/send-alerts',{method:'POST'}).then(function(r){return r.json();}).then(function(j){
        msg(j.sent?(('Sent '+j.count+' alert(s)')):(j.message||j.error||'Done'));
      }).catch(function(){ msg('Failed'); });
    });
    document.getElementById('app-send-sms') && document.getElementById('app-send-sms').addEventListener('click',function(){
      msg('Sending…');
      fetch('/notifications/send-sms',{method:'POST'}).then(function(r){return r.json();}).then(function(j){
        msg(j.sent?(('SMS batch ok')):(j.message||j.error||'Done'));
      }).catch(function(){ msg('Failed'); });
    });
    function postJSON(url, body){
      return fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})
        .then(function(r){return r.json();});
    }
    document.querySelectorAll('form.app-status-form').forEach(function(f){
      f.addEventListener('submit',function(ev){
        ev.preventDefault();
        var fd=new FormData(f);
        var orderId=fd.get('orderId'); var status=fd.get('status');
        var btn=f.querySelector('button[type="submit"]'); if(btn) btn.disabled=true;
        postJSON('/orders/update-status',{orderId:orderId,status:status}).then(function(d){
          if(d&&d.success) location.reload();
          else { msg(d&&d.error||d&&d.reason||'Status blocked'); if(btn) btn.disabled=false; }
        }).catch(function(){ msg('Network error'); if(btn) btn.disabled=false; });
      });
    });
    document.querySelectorAll('form.app-exec-form').forEach(function(f){
      f.addEventListener('submit',function(ev){
        ev.preventDefault();
        var fd=new FormData(f);
        var payload={}; try{ payload=JSON.parse(fd.get('payload')||'{}'); }catch(e){}
        var body={
          approved:fd.get('approved')==='true',
          actionType:fd.get('actionType'),
          orderId:fd.get('orderId')||'',
          customerId:fd.get('customerId')||'',
          payload:payload
        };
        var btn=f.querySelector('button[type="submit"]'); if(btn) btn.disabled=true;
        postJSON('/automation/execute',body).then(function(d){
          if(d&&d.success) { msg('OK'); location.reload(); }
          else { msg((d&&d.error)||'Execute failed'); if(btn) btn.disabled=false; }
        }).catch(function(){ msg('Network error'); if(btn) btn.disabled=false; });
      });
    });
    var salesRun=document.getElementById('app-sales-run');
    var salesRunMsg=document.getElementById('app-sales-run-msg');
    if(salesRun) salesRun.addEventListener('click',function(){
      if(salesRunMsg) salesRunMsg.textContent='Running cycle…';
      salesRun.disabled=true;
      fetch('/sales/run',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})
        .then(function(r){return r.json();})
        .then(function(d){
          if(salesRunMsg) salesRunMsg.textContent='SMS: '+(d.followupsSent||0)+' · Drafts: '+(d.draftInvoicesCreated||0)+(d.errors&&d.errors.length?' · see console':'');
          salesRun.disabled=false;
          if(d&&(d.followupsSent||d.draftInvoicesCreated)) location.reload();
        })
        .catch(function(){ if(salesRunMsg) salesRunMsg.textContent='Failed'; salesRun.disabled=false; });
    });
    var opRun=document.getElementById('app-operator-run');
    var opRunMsg=document.getElementById('app-operator-run-msg');
    if(opRun) opRun.addEventListener('click',function(){
      if(opRunMsg) opRunMsg.textContent='Running operator…';
      opRun.disabled=true;
      postJSON('/sales/operator/run',{})
        .then(function(d){
          if(opRunMsg) opRunMsg.textContent=(d&&d.success)?'Done — refreshing…':((d&&d.error)||'Failed');
          opRun.disabled=false;
          if(d&&d.success) location.reload();
        })
        .catch(function(){ if(opRunMsg) opRunMsg.textContent='Failed'; opRun.disabled=false; });
    });
    function postAutopilot(url){
      var by='Patrick';
      return postJSON(url,{changedBy:by});
    }
    var apMsg=document.getElementById('app-autopilot-msg');
    function apSet(t){ if(apMsg) apMsg.textContent=t||''; }
    var apEnable=document.getElementById('app-autopilot-enable');
    if(apEnable) apEnable.addEventListener('click',function(){
      apSet('Enabling autopilot…');
      apEnable.disabled=true;
      postAutopilot('/autopilot/enable').then(function(d){
        apSet((d&&d.success)?'Autopilot enabled':'Failed');
        apEnable.disabled=false;
        location.reload();
      }).catch(function(){ apSet('Request failed'); apEnable.disabled=false; });
    });
    var apDisable=document.getElementById('app-autopilot-disable');
    if(apDisable) apDisable.addEventListener('click',function(){
      apSet('Disabling autopilot…');
      apDisable.disabled=true;
      postAutopilot('/autopilot/disable').then(function(d){
        apSet((d&&d.success)?'Autopilot disabled':'Failed');
        apDisable.disabled=false;
        location.reload();
      }).catch(function(){ apSet('Request failed'); apDisable.disabled=false; });
    });
    var apKill=document.getElementById('app-autopilot-kill');
    if(apKill) apKill.addEventListener('click',function(){
      apSet('Activating kill switch…');
      apKill.disabled=true;
      postAutopilot('/autopilot/kill').then(function(d){
        apSet((d&&d.success)?'Kill switch ACTIVE':'Failed');
        apKill.disabled=false;
        location.reload();
      }).catch(function(){ apSet('Request failed'); apKill.disabled=false; });
    });
    var apRestore=document.getElementById('app-autopilot-restore');
    if(apRestore) apRestore.addEventListener('click',function(){
      apSet('Restoring system…');
      apRestore.disabled=true;
      postAutopilot('/autopilot/restore').then(function(d){
        apSet((d&&d.success)?'Kill switch cleared':'Failed');
        apRestore.disabled=false;
        location.reload();
      }).catch(function(){ apSet('Request failed'); apRestore.disabled=false; });
    });
    var rbRun=document.getElementById('app-runbook-run');
    var rbRunMsg=document.getElementById('app-runbook-run-msg');
    if(rbRun) rbRun.addEventListener('click',function(){
      if(rbRunMsg) rbRunMsg.textContent='Running full runbook…';
      rbRun.disabled=true;
      postJSON('/runbook/run',{})
        .then(function(d){
          if(rbRunMsg) rbRunMsg.textContent=(d&&d.success)?'Done — refreshing…':((d&&d.error)||'Failed');
          rbRun.disabled=false;
          if(d&&d.success) location.reload();
        })
        .catch(function(){ if(rbRunMsg) rbRunMsg.textContent='Failed'; rbRun.disabled=false; });
    });
    var aiForm=document.getElementById('app-auto-invoice-form');
    var aiMsg=document.getElementById('app-auto-invoice-msg');
    if(aiForm) aiForm.addEventListener('submit',function(ev){
      ev.preventDefault();
      var fd=new FormData(aiForm);
      if(aiMsg) aiMsg.textContent='Running check…';
      postJSON('/responses/auto-invoice',{
        customerName:String(fd.get('customerName')||'').trim(),
        message:String(fd.get('message')||'').trim(),
        customerId:String(fd.get('customerId')||'').trim(),
        amount:Number(fd.get('amount')||0),
        orderId:String(fd.get('orderId')||'').trim()
      }).then(function(d){
        if(aiMsg) aiMsg.textContent=String(d.reason||d.error||'').slice(0,220)||'Done';
        if(d&&d.success===false&&!d.reason&&!d.executed) return;
        location.reload();
      }).catch(function(){ if(aiMsg) aiMsg.textContent='Request failed'; });
    });
    document.querySelectorAll('.app-copy-reply').forEach(function(btn){
      btn.addEventListener('click',function(){
        var wrap=btn.parentElement;
        var pre=wrap&&wrap.querySelector('.reply-draft-text');
        var t=pre?pre.textContent:'';
        function ok(){ if(btn) btn.textContent='Copied'; setTimeout(function(){ btn.textContent='Copy Reply'; },1500); }
        if(navigator.clipboard&&navigator.clipboard.writeText){
          navigator.clipboard.writeText(t).then(ok).catch(function(){
            try{ var ta=document.createElement('textarea'); ta.value=t; ta.style.position='fixed'; ta.style.left='-9999px'; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta); ok(); }catch(e){}
          });
        } else {
          try{ var ta2=document.createElement('textarea'); ta2.value=t; document.body.appendChild(ta2); ta2.select(); document.execCommand('copy'); document.body.removeChild(ta2); ok(); }catch(e){}
        }
      });
    });
    document.querySelectorAll('.app-prep-msg').forEach(function(btn){
      btn.addEventListener('click',function(){
        var out=btn.parentElement&&btn.parentElement.querySelector('.app-prep-out');
        if(out){ out.style.display='block'; out.textContent='Loading…'; }
        postJSON('/automation/prepare-message',{
          type:btn.getAttribute('data-type')||'followup',
          customerName:btn.getAttribute('data-name')||'',
          amount:Number(btn.getAttribute('data-amount')||0),
          daysOld:Number(btn.getAttribute('data-days')||0)
        }).then(function(d){
          if(out) out.textContent=d.message||(d.error||JSON.stringify(d));
        }).catch(function(){ if(out) out.textContent='Request failed'; });
      });
    });
  })();
  </script>`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover"/>
  <meta name="theme-color" content="#0a0a0a"/>
  <title>Command Center — Cheeky</title>
</head>
<body style="margin:0;padding:14px;padding-bottom:max(24px,env(safe-area-inset-bottom));font-family:system-ui,-apple-system,sans-serif;background:#0a0a0a;color:#e8e8e8;max-width:520px;margin-left:auto;margin-right:auto;">
  <h1 style="font-size:1.35rem;margin:8px 0 4px;color:#f0ff44;font-weight:900;">Cheeky Tees</h1>
  <p style="margin:0 0 12px;font-size:0.92rem;opacity:0.75;">Command Center</p>
  ${topBar}
  ${autopilotPanelHtml}
  ${pricingRiskSectionHtml(esc)}
  ${salesLoopHtml}
  ${operatorPanelHtml}
  ${runbookPanelHtml}
  ${responsesPanelHtml}
  ${nextStepsPanelHtml}
  ${autoInvoicePanelHtml}
  ${replyDraftsPanelHtml}
  ${copilotHtml}
  ${summaryHtml}
  ${actionsHtml}
  ${alertsHtml}
  ${followHtml}
  ${prodHtml}
  ${script}
</body>
</html>`;

  res.type("html").send(html);
});

module.exports = router;
